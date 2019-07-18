# it-multistream-select

"Dialer"

```js
const pipe = require('it-pipe')
const MSS = require('it-multistream-select')
const Mplex = require('it-mplex')

const muxer = new Mplex()
const muxedStream = muxer.newStream()

const dhtStream = await MSS.select(muxedStream, '/ipfs-dht/1.0.0')

try {
  await pipe(
    [Buffer.from('Some DHT data')]
    dhtStream,
    async source => {
      for await (const chunk of source)
        // DHT response data
    }
  )
} catch (err) {
  // Error in stream
}
```

* We want to `await` on `MSS.select` because if it fails we might want to try another protocol

"Listener"

```js
const pipe = require('it-pipe')
const MSS = require('it-multistream-select')
const Mplex = require('it-mplex')

const muxer = new Mplex({
  onStream (muxedStream) {
    MSS.handle(muxedStream, {
      // TODO: how to not exact match?
      '/ipfs-dht/1.0.0': dhtStream => {
        try {
          await pipe(
            dhtStream,
            source => (async function * () {
              for await (const chunk of source)
                // Incoming DHT data -> process and yield to respond
            })(),
            dhtStream
          )
        } catch (err) {
          // Error in stream
        }
      }
    })
  }
})
```
