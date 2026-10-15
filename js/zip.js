/* ============================================================
 * zip.js —— 最小可用的 ZIP 读写（零依赖）
 *
 * 为什么不用现成的库：这个项目刻意保持「打开 index.html 就能跑」，
 * 不引任何第三方代码，也不做打包。ZIP 的容器格式本身不复杂，
 * 自己写一份反而比塞一个压缩库更可控。
 *
 * 写：一律用 STORE（不压缩）。理由——
 *   1) 不依赖 CompressionStream（老 WebView 没有），写入路径永远可用；
 *   2) 导出的 zip 里全是 JSON/文本，本来就是给人看、给别处解析的，
 *      压不压缩只影响几 MB，换来的确定性更值。
 * 读：支持 STORE 和 DEFLATE（别人的 zip 可能是压缩过的）。
 *   DEFLATE 走 DecompressionStream('deflate-raw')，没有就明确报错，
 *   而不是悄悄吐出一堆乱码。
 *
 * 没有实现的：ZIP64（>4GB）、加密、分卷、以及 zip 里的目录条目 ——
 * 备份文件不可能碰到这些。
 * ============================================================ */
(function (global) {
  'use strict';

  var SIG_LOCAL = 0x04034b50;
  var SIG_CENTRAL = 0x02014b50;
  var SIG_EOCD = 0x06054b50;

  var M_STORE = 0;
  var M_DEFLATE = 8;

  /* ---------- CRC32 ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xffffffff;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------- 字节工具 ---------- */
  function utf8(str) {
    if (global.TextEncoder) return new global.TextEncoder().encode(String(str));
    // 极老的 WebView 兜底：手工编码
    var s = unescape(encodeURIComponent(String(str)));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') return utf8(data);
    if (data && typeof data.byteLength === 'number') return new Uint8Array(data);
    return utf8(data == null ? '' : String(data));
  }

  function text(bytes) {
    if (global.TextDecoder) return new global.TextDecoder('utf-8').decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  function base64(bytes) {
    var out = '';
    var CH = 0x8000; // 分块，避免 String.fromCharCode 参数过多爆栈
    for (var i = 0; i < bytes.length; i += CH) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    if (typeof global.btoa === 'function') return global.btoa(out);
    // Node 里没 btoa 时（很老的版本）用 Buffer
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    throw new Error('当前环境没有 base64 编码能力');
  }

  /* ---------- 小端写 ---------- */
  function w16(a, v) { a.push(v & 0xff, (v >>> 8) & 0xff); }
  function w32(a, v) { a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function concat(chunks) {
    var n = 0, i;
    for (i = 0; i < chunks.length; i++) n += chunks[i].length;
    var out = new Uint8Array(n);
    var at = 0;
    for (i = 0; i < chunks.length; i++) { out.set(chunks[i], at); at += chunks[i].length; }
    return out;
  }

  /**
   * 生成一个 zip。
   * @param {Array<{name:string, data:string|Uint8Array}>} entries
   * @returns {Uint8Array}
   */
  function write(entries) {
    if (!entries || !entries.length) throw new Error('zip 里至少要有一个文件');
    var locals = [];
    var centrals = [];
    var offset = 0;

    entries.forEach(function (e) {
      var name = String(e.name || '').replace(/\\/g, '/');
      if (!name) throw new Error('zip 条目缺少文件名');
      var nameBytes = utf8(name);
      var data = toBytes(e.data);
      var crc = crc32(data);

      var lh = [];
      w32(lh, SIG_LOCAL);
      w16(lh, 20);            // 解压所需版本
      w16(lh, 0x0800);        // bit 11 = 文件名是 UTF-8
      w16(lh, M_STORE);
      w16(lh, 0);             // 修改时间（固定，保证同样输入生成同样字节）
      w16(lh, 0x21);          // 修改日期 = 1980-01-01（zip 纪元起点）
      w32(lh, crc);
      w32(lh, data.length);
      w32(lh, data.length);
      w16(lh, nameBytes.length);
      w16(lh, 0);             // 无 extra
      var lhBytes = new Uint8Array(lh);
      var local = concat([lhBytes, nameBytes, data]);
      locals.push(local);

      var ch = [];
      w32(ch, SIG_CENTRAL);
      w16(ch, 20);            // 创建版本（MS-DOS / 2.0）
      w16(ch, 20);
      w16(ch, 0x0800);
      w16(ch, M_STORE);
      w16(ch, 0);
      w16(ch, 0x21);
      w32(ch, crc);
      w32(ch, data.length);
      w32(ch, data.length);
      w16(ch, nameBytes.length);
      w16(ch, 0);             // extra
      w16(ch, 0);             // comment
      w16(ch, 0);             // 起始磁盘
      w16(ch, 0);             // 内部属性
      w32(ch, 0);             // 外部属性
      w32(ch, offset);        // 本地头偏移
      centrals.push(concat([new Uint8Array(ch), nameBytes]));

      offset += local.length;
    });

    var cd = concat(centrals);
    var eocd = [];
    w32(eocd, SIG_EOCD);
    w16(eocd, 0);
    w16(eocd, 0);
    w16(eocd, entries.length);
    w16(eocd, entries.length);
    w32(eocd, cd.length);
    w32(eocd, offset);
    w16(eocd, 0);

    return concat([concat(locals), cd, new Uint8Array(eocd)]);
  }

  /* ---------- 读 ---------- */
  function findEOCD(b) {
    // EOCD 在最末尾，注释最长 65535 字节，从后往前找
    var max = Math.min(b.length, 65557);
    for (var i = 22; i <= max; i++) {
      var at = b.length - i;
      if (u32(b, at) === SIG_EOCD) return at;
    }
    return -1;
  }

  function inflateRaw(bytes) {
    if (typeof global.DecompressionStream !== 'function') {
      return Promise.reject(new Error('这个 zip 用了压缩（DEFLATE），但当前浏览器不支持解压。请在能打开的浏览器里重新导出，或用「导出」重新生成一份。'));
    }
    var stream = new global.Blob([bytes]).stream().pipeThrough(new global.DecompressionStream('deflate-raw'));
    return new global.Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  /**
   * 解开一个 zip。
   * @param {ArrayBuffer|Uint8Array} buf
   * @returns {Promise<Array<{name:string, bytes:Uint8Array}>>}
   */
  function read(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var eocd = findEOCD(b);
    if (eocd < 0) return Promise.reject(new Error('这不是一个 zip 文件（找不到结尾标记）'));

    var count = u16(b, eocd + 10);
    var cdOffset = u32(b, eocd + 16);
    if (cdOffset >= b.length) return Promise.reject(new Error('zip 结构损坏（中央目录位置越界）'));

    var entries = [];
    var p = cdOffset;
    for (var i = 0; i < count; i++) {
      if (u32(b, p) !== SIG_CENTRAL) return Promise.reject(new Error('zip 结构损坏（第 ' + (i + 1) + ' 个目录项签名不对）'));
      var method = u16(b, p + 10);
      var compSize = u32(b, p + 20);
      var uncompSize = u32(b, p + 24);
      var nameLen = u16(b, p + 28);
      var extraLen = u16(b, p + 30);
      var commentLen = u16(b, p + 32);
      var localAt = u32(b, p + 42);
      var name = text(b.subarray(p + 46, p + 46 + nameLen));

      if (u32(b, localAt) !== SIG_LOCAL) return Promise.reject(new Error('zip 结构损坏（' + name + ' 的本地头签名不对）'));
      var lNameLen = u16(b, localAt + 26);
      var lExtraLen = u16(b, localAt + 28);
      var dataAt = localAt + 30 + lNameLen + lExtraLen;
      var raw = b.subarray(dataAt, dataAt + compSize);

      if (!/\/$/.test(name)) {
        entries.push({ name: name, method: method, raw: raw, size: uncompSize });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }

    // 逐个解出来（DEFLATE 是异步的，所以整条链是 Promise）
    return entries.reduce(function (chain, e) {
      return chain.then(function (acc) {
        if (e.method === M_STORE) {
          // 复制一份：subarray 是视图，底层 buffer 很大，直接留着会拖住整包内存
          acc.push({ name: e.name, bytes: e.raw.slice() });
          return acc;
        }
        if (e.method === M_DEFLATE) {
          return inflateRaw(e.raw).then(function (bytes) {
            acc.push({ name: e.name, bytes: bytes });
            return acc;
          });
        }
        return Promise.reject(new Error('zip 里的 ' + e.name + ' 用了不支持的压缩方式（' + e.method + '）'));
      });
    }, Promise.resolve([]));
  }

  global.Zip = {
    write: write,
    read: read,
    crc32: crc32,
    utf8: utf8,
    text: text,
    base64: base64
  };
})(typeof window !== 'undefined' ? window : globalThis);
