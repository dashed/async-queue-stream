async-queue-stream
==================

Wrapper for [through](https://github.com/dominictarr/through) stream to use [async.queue](https://github.com/caolan/async#queueworker-concurrency) under the hood.

It takes an asynchronous function and queue stream chunks. Then the queue executes the asynchronous function up to the concurrency threshold.

Any error will be emitted to `opts.error_event` event. By default, the stream will not stop on error; this can be configured via `opts.stop_on_error`.

## Install

1. Install [Node.js](http://nodejs.org/)

2.  Run: `npm install async-queue-stream`

## API

### asyncqueue(write_fn [[, end_fn], options])

**Arguments**

* `write_fn(data, callback)` - an asnynchronous function that will be wrapped into a through stream

    `data` is the queued stream chunk.

    There are three ways to invoke callback:
    * `callback(null, transformedData)` - emit data
    * `callback(error)` - emit error
    * `callback()` - drop data (don't emit to next stream)

* `end_fn()` - a function that will be invoked when no more data will be provided.

* `options` - an object containing options
    * `options.concurrency` - concurrency argument to [async.queue](https://github.com/caolan/async#queueworker-concurrency). ***Default:*** 1

    * `options.error_event` - event name used to emit the error from callback via the asynchronous function. ***Default:*** 'failure'

    * `options.stop_on_error` - boolean value for `asyncqueue` to stop queuing any more stream chunks if callback via the asynchronous function has emitted an error. ***Default:*** false

        **Note:** Any tasks already executed will be able to complete.

Example
=======

```js
var es = require('event-stream');
var qasync = require('queue-async-stream');

// something that returns stream using queue-async-stream internally
var plugin = function(filter, filter_func) {

    if(filter_func == void 0)
        filter_func = function(n) { return n; };

    return qasync(function (data, cb) {

        if(filter_func(data) == filter) {
            setTimeout(function() {

                return cb(new Error(filter+''));
            }, 1000);
            return;
        }

        if(data === 2) {
            setTimeout(function() {
                return cb(null, data);
            }, 2000);
            return;
        }

        console.log('caught in plugin: ' + data)
        return cb(null, data);

   }, {concurrency: 2});
};


es.readArray([1,2,3,4,5])
    .pipe(plugin(3))
        .on('failure', console.log)
    .pipe(es.through(function(n) {

        console.log('caught in es.through: ' + n);

        this.emit('data', n);
    }));
/**
Output:
    caught in plugin: 1
    caught in es.through: 1
    [Error: 3]
    caught in plugin: 4
    caught in es.through: 4
    caught in plugin: 5
    caught in es.through: 5
    caught in es.through: 2


With stop_on_error:true, output is:
    caught in plugin: 1
    caught in es.through: 1
    [Error: 3]
    caught in es.through: 2
 */
```

To Do
=====

1. Be able to pass opts/hooks to async.queue (e.g. drain, empty, etc)

License
=======

MIT. See LICENSE file.
