'use strict'
/* eslint-env mocha */

const chai = require('chai')
chai.use(require('dirty-chai'))
const { expect } = chai
const MSS = require('../')
const pipe = require('it-pipe')
const { collect } = require('streaming-iterables')
const Crypto = require('crypto')
const BufferList = require('bl')
const Pair = require('it-pair')
const throwsAsync = require('./helpers/throws-async')

describe('select', () => {
  it('should select from single protocol', async () => {
    const protocol = '/echo/1.0.0'
    const muxedStream = Pair()

    const selection = await MSS.select(muxedStream, protocol)
    expect(selection.protocol).to.equal(protocol)

    // Ensure stream is usable after selection
    const input = [Crypto.randomBytes(10), Crypto.randomBytes(64), Crypto.randomBytes(3)]
    const output = await pipe(input, selection.stream, collect)
    expect(BufferList(output).slice()).to.eql(BufferList(input).slice())
  })

  it('should select from multiple protocols', async () => {
    const protocols = ['/echo/2.0.0', '/echo/1.0.0']
    const pair = Pair()
    const muxedStream = {
      sink: pair.sink,
      source: (async function * () {
        for await (const chunk of pair.source) {
          if (chunk.toString().includes(protocols[0])) {
            const res = 'na\n'
            yield Buffer.concat([Buffer.from([res.length]), Buffer.from(res)])
          } else if (chunk.toString().includes(protocols[1])) {
            const res = `${protocols[1]}\n`
            yield Buffer.concat([Buffer.from([res.length]), Buffer.from(res)])
          } else {
            yield chunk
          }
        }
      })()
    }

    const selection = await MSS.select(muxedStream, protocols)
    expect(selection.protocol).to.equal(protocols[1])

    // Ensure stream is usable after selection
    const input = [Crypto.randomBytes(10), Crypto.randomBytes(64), Crypto.randomBytes(3)]
    const output = await pipe(input, selection.stream, collect)
    expect(BufferList(output).slice()).to.eql(BufferList(input).slice())
  })

  it('should throw if protocol selection fails', async () => {
    const protocol = '/echo/1.0.0'
    const pair = Pair()
    const muxedStream = {
      sink: pair.sink,
      source: (async function * () {
        yield Buffer.concat([Buffer.from([2]), Buffer.from('na')])
      })()
    }

    const err = await throwsAsync(MSS.select(muxedStream, protocol))
    expect(err.code).to.equal('ERR_UNSUPPORTED_PROTOCOL')
  })
})
