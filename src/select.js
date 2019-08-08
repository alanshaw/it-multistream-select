'use strict'

const { Buffer } = require('buffer')
const Reader = require('it-reader')
const Writer = require('it-pushable')
const Lp = require('it-length-prefixed')
const pipe = require('it-pipe')
const defer = require('p-defer')
const log = require('debug')('it-multistream-select:select')

module.exports = async (stream, protocols) => {
  protocols = Array.isArray(protocols) ? protocols : [protocols]

  const writer = Writer() // Used to write protocol selection query to the stream
  const reader = Reader(stream.source) // Used to read a single response

  // Waits for a source to be passed to the selectedStream's sink
  const sourcePromise = defer()

  stream.sink((async function * () {
    yield * writer
    const source = await sourcePromise.promise
    yield * source
  })())

  const selectedStream = {
    sink: source => sourcePromise.resolve(source),
    source: reader
  }

  for (const protocol of protocols) {
    log('request %s', protocol)
    await writeRequest(writer, protocol)
    const response = await readResponse(reader)
    log('response %s %s', protocol, response)
    if (response.toString().slice(0, -1) === protocol) {
      writer.end() // End our writer so others can start writing to stream
      return { stream: selectedStream, protocol }
    }
  }

  throw Object.assign(
    new Error(`failed to select protocol from ${protocols}`),
    { code: 'ERR_UNSUPPORTED_PROTOCOL' }
  )
}

async function oneChunk (source) {
  for await (const chunk of source) return chunk // We only need one!
}

async function writeRequest (writer, data) {
  const encoded = await pipe([Buffer.from(`${data}\n`)], Lp.encode(), oneChunk)
  writer.push(encoded)
}

function readResponse (reader) {
  const oneByteSource = { [Symbol.asyncIterator]: () => ({ next: () => reader.next(1) }) }
  return pipe(oneByteSource, Lp.decode(), oneChunk)
}
