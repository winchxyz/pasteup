// A plain zip writer: files are stored as they are (PNG is already compressed).

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function header(size, fill) {
  const view = new DataView(new ArrayBuffer(size));
  fill(view);
  return new Uint8Array(view.buffer);
}

// files: [{ name, blob }]
export async function zip(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const index = [];
  let offset = 0;

  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
    });
    index.push({ name, crc, size: data.length, offset });
    parts.push(local, name, data);
    offset += local.length + name.length + data.length;
  }

  const start = offset;
  for (const entry of index) {
    const central = header(46, (v) => {
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true);
      v.setUint16(12, time, true); v.setUint16(14, date, true); v.setUint32(16, entry.crc, true);
      v.setUint32(20, entry.size, true); v.setUint32(24, entry.size, true); v.setUint16(28, entry.name.length, true);
      v.setUint32(42, entry.offset, true);
    });
    parts.push(central, entry.name);
    offset += central.length + entry.name.length;
  }

  parts.push(header(22, (v) => {
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, index.length, true); v.setUint16(10, index.length, true);
    v.setUint32(12, offset - start, true); v.setUint32(16, start, true);
  }));
  return new Blob(parts, { type: 'application/zip' });
}
