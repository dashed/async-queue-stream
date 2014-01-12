var through = require('through');

/// start async stuff ////
// broken async.queue out at commit f01b3992fb
// from: https://github.com/caolan/async
var async = {};

function only_once(fn) {
    var called = false;
    return function() {
        if (called) throw new Error("Callback was already called.");
        called = true;
        fn.apply(this, arguments);
    };
}

async.setImmediate = setImmediate;

var _each = function (arr, iterator) {
    if (arr.forEach) {
        return arr.forEach(iterator);
    }
    for (var i = 0; i < arr.length; i += 1) {
        iterator(arr[i], i, arr);
    }
};

async.queue = function (worker, concurrency) {
    if (concurrency === undefined) {
        concurrency = 1;
    }
    function _insert(q, data, pos, callback) {
      if(data.constructor !== Array) {
          data = [data];
      }
      _each(data, function(task) {
          var item = {
              data: task,
              callback: typeof callback === 'function' ? callback : null
          };

          if (pos) {
            q.tasks.unshift(item);
          } else {
            q.tasks.push(item);
          }

          if (q.saturated && q.tasks.length === concurrency) {
              q.saturated();
          }
          async.setImmediate(q.process);
      });
    }

    var workers = 0;
    var q = {
        tasks: [],
        concurrency: concurrency,
        saturated: null,
        empty: null,
        drain: null,
        push: function (data, callback) {
          _insert(q, data, false, callback);
        },
        unshift: function (data, callback) {
          _insert(q, data, true, callback);
        },
        process: function () {
            if (workers < q.concurrency && q.tasks.length) {
                var task = q.tasks.shift();
                if (q.empty && q.tasks.length === 0) {
                    q.empty();
                }
                workers += 1;
                var next = function () {
                    workers -= 1;
                    if (task.callback) {
                        task.callback.apply(task, arguments);
                    }
                    if (q.drain && q.tasks.length + workers === 0) {
                        q.drain();
                    }
                    q.process();
                };
                var cb = only_once(next);
                worker(task.data, cb);
            }
        },
        length: function () {
            return q.tasks.length;
        },
        running: function () {
            return workers;
        }
    };
    return q;
};

/// end async stuff ////


//// meat ////

/**
 * stream wrapper of through using async.queue under the hood
 *
 * queueAsync(write_fn[[, end_fn], opts])
 */
var queueAsync = function (write_fn, end_fn, opts) {

    opts = opts || {};

    // support queueAsync(write_fn, opts)
    if(typeof end_fn == 'object' && end_fn.constructor == Object) {
      opts = end_fn;
      end_fn = function() {this.emit('end');};
    }

    opts.concurrency = opts.concurrency || 1;

    opts.error_event = opts.error_event || 'failure';
    opts.stop_on_error = !!opts.stop_on_error;

    write_fn = write_fn || function(data, cb) {cb(null,data);};
    end_fn = end_fn || function() {this.emit('end');};

    // toggle to stop on error
    var error_raised = false;

    // check if the queue has ever been used
    var queue_used = false;

    // set up queue and its hard worker
    var worker = function(_work, callback) {

      var _args, _f, _this;

      _f = _work.f;
      _this = _work._this;
      _args = _work._args || [];

      // wrap _write_callback to call async.queue callback
      var _w_cb = _work.write_cb;

      _args.push(_w_cb.bind({}, _work.write_cb_stream, callback));

      // _args.push(callback);
      if(error_raised !== true)
        return _f.apply(_this, _args);
    };

    var queue = async.queue(worker, opts.concurrency);

    // callback signature ref.
    //
    // callback(); - drop
    // callback(null, null); - emit null as data
    // callback(null, data); - emit data
    // callback(err, null); - emit err

    // _write_callback is called when write_fn wants to push err or data
    // reminder: cb is async.queue callback
    var _write_callback = function(stream, cb, err, data) {
        if(err) {
            if(opts.stop_on_error && !error_raised)
                error_raised = true;

            stream.emit(opts.error_event, err);
        }

        if(data !== void 0) {
            stream.emit('data', data);
        }

        try{
            return cb();
        } catch(err) {
        }
    };

    // _work_callback is called when
    var _work_callback = function(err) {
    };

    var _write = function(data) {

        var _work_callback_binded = _work_callback.bind(this);

        var work_package = {};
        work_package.f = write_fn;
        work_package._this = {};
        work_package._args = [data];

        work_package.write_cb = _write_callback;
        work_package.write_cb_stream = this;

        if(error_raised !== true)  {
          queue.push(work_package, _work_callback_binded);
          queue_used = true;
        }

    };

    var _empty = false;

    var stream = through(_write, function(){
      _empty = true;

      // if the queue has never been used,
      // force end_fn
      if(queue_used === false) {
        end_fn.bind(stream)();
      }
    });

    // Clean up
    queue.drain = function() {
        if(_empty) {
            end_fn.bind(stream)();
        }
    };

    return stream;
};

module.exports = queueAsync.bind({});
