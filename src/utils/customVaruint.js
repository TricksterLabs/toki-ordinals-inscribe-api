// var Buffer = require('safe-buffer').Buffer
// import Buffer from 'safe-buffer';
import { Buffer } from 'safe-buffer';

// Number.MAX_SAFE_INTEGER
var MAX_SAFE_INTEGER = 9007199254740991

function checkUInt53(n) {
  if (n < 0 || n > MAX_SAFE_INTEGER || n % 1 !== 0) throw new RangeError('value out of range')
}

export function encode(number, buffer, offset) {
  checkUInt53(number)

  if (!buffer) buffer = Buffer.allocUnsafe(encodingLength(number))
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer instance')
  if (!offset) offset = 0

  // 8 bit
  if (number < 0x4c) {
    buffer.writeUInt8(number, offset)
    encode.bytes = 1

  } else if (number < 0xfd) {
    buffer.writeUInt8(0x4c, offset);
    buffer.writeUInt8(number, offset + 1);
    encode.bytes = 2;

    // 16 bit
  } else if (number <= 0xffff) {
    buffer.writeUInt8(0x4d, offset)
    buffer.writeUInt16LE(number, offset + 1)
    encode.bytes = 3

    // 32 bit
  } else if (number <= 0xffffffff) {
    buffer.writeUInt8(0xfe, offset)
    buffer.writeUInt32LE(number, offset + 1)
    encode.bytes = 5

    // 64 bit
  } else {
    buffer.writeUInt8(0xff, offset)
    buffer.writeUInt32LE(number >>> 0, offset + 1)
    buffer.writeUInt32LE((number / 0x100000000) | 0, offset + 5)
    encode.bytes = 9
  }

  // If the length prefix is 3 bytes, adjust the first byte to be 0x4d instead of 0xfd
  // if (encode.bytes === 3) {
  //   buffer.writeUInt8(0x4d, offset)
  // }

  return buffer
}

export function decode(buffer, offset) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer instance')
  if (!offset) offset = 0

  var first = buffer.readUInt8(offset)

  // 8 bit
  if (first < 0xfd) {
    decode.bytes = 1
    return first

    // 16 bit
  } else if (first === 0xfd) {
    decode.bytes = 3
    return buffer.readUInt16LE(offset + 1)

    // 32 bit
  } else if (first === 0xfe) {
    decode.bytes = 5
    return buffer.readUInt32LE(offset + 1)

    // 64 bit
  } else {
    decode.bytes = 9
    var lo = buffer.readUInt32LE(offset + 1)
    var hi = buffer.readUInt32LE(offset + 5)
    var number = hi * 0x0100000000 + lo
    checkUInt53(number)

    return number
  }
}

export function encodingLength(number) {
  checkUInt53(number)

  return (
    number < 0x4c ? 1
      : number < 0xfd ? 2
        : number <= 0xffff ? 3
          : number <= 0xffffffff ? 5
            : 9
  )
}

// module.exports = { encode: encode, decode: decode, encodingLength: encodingLength }
