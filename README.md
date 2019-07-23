# it-multistream-select

## "Dialer"

```js
const pipe = require('it-pipe')
const MSS = require('it-multistream-select')
const Mplex = require('it-mplex') // https://github.com/alanshaw/it-mplex

const muxer = new Mplex()
const muxedStream = muxer.newStream()

// MSS.select(stream, protocol(s))
// Select from one of the passed protocols (in priority order)
// Returns selected stream and protocol
const { stream: dhtStream, protocol } = await MSS.select(muxedStream, [
  // This might just be different versions of DHT, but could be different impls
  '/ipfs-dht/2.0.0', // Most of the time this will probably just be one item.
  '/ipfs-dht/1.0.0'
])

// Typically this stream will be passed back to the caller of libp2p.dialProtocol
//
// ...it might then do something like this:
// try {
//   await pipe(
//     [Buffer.from('Some DHT data')]
//     dhtStream,
//     async source => {
//       for await (const chunk of source)
//         // DHT response data
//     }
//   )
// } catch (err) {
//   // Error in stream
// }
```

- There's no need to separate the handshake and protocol selection. We never need to handshake and wait before selecting (right?)
    - i.e. no need for `dialer.handle(muxedStream, () => dialer.select('/ipfs-dht/1.0.0'))`
- We don't create an instance of a class (like `Dialer`/`Listener`) since there's no state to keep track of - the call to `select` retains the state iterating through the provided protocol list until `na` is not sent back
- We want to `await` on `MSS.select` because we need to know what protocol was selected from our list, before we start talking
    - In the current libp2p API (`dialProtocol`) we can only pass one protocol, but this allows for selecting between differing versions or implementations
- What to do about `ls`?
    - Given that most IPFS nodes talk the same protocols and versions, interactive negotiation is probably our best bet, because we're likely to reach agreement straight away
    - Idea: `MSS.select` could take an `options.interactive` parameter (default `true`). If set to `false` it uses `ls` to list available protocols. The listing could be returned by `MSS.select` in this case and cached by libp2p against the peer ID so subsequent selects can be sent in interactive mode and succeed or fail fast (because we already know what protocols the node supports). Although that assumes the remote node cannot dynamically add handlers...

## "Listener"

```js
const pipe = require('it-pipe')
const MSS = require('it-multistream-select')
const Mplex = require('it-mplex') // https://github.com/alanshaw/it-mplex

const muxer = new Mplex({
  async onStream (muxedStream) {
    // MSS.handle(stream, handledProtocols)
    // Returns selected stream and protocol
    const { stream, protocol } = await MSS.handle(muxedStream, [
      '/ipfs-dht/1.0.0',
      '/ipfs-bitswap/1.0.0'
    ])

    // Typically here we'd call the handler function that was registered in
    // libp2p for the given protocol:
    // e.g. handlers[protocol].hander(stream)
    //
    // If protocol was /ipfs-dht/1.0.0 it might do something like this:
    // try {
    //   await pipe(
    //     dhtStream,
    //     source => (async function * () {
    //       for await (const chunk of source)
    //         // Incoming DHT data -> process and yield to respond
    //     })(),
    //     dhtStream
    //   )
    // } catch (err) {
    //   // Error in stream
    // }
  }
})
```

- On the listener side, we just `await MSS.handle`, passing it a list of protocols we support
    - It gives us back a selected `stream` and `protocol`
    - We can use the selected `protocol` to lookup the handler that was added to libp2p
- We could pass `options` to `MSS.handle` with a `match` function that allows us to use a compatible protocol if not exact match
- Symmetric API is nice - both functions return a `stream` and a `protocol`
