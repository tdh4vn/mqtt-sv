// 'use strict'
const fs = require('fs'),
  mongoose = require('mongoose')
const SECURE_KEY = '/etc/letsencrypt/live/seeyourair.com/privkey.pem',
  SECURE_CERT = '/etc/letsencrypt/live/seeyourair.com/fullchain.pem'

const privateKey = fs.readFileSync(SECURE_KEY, 'utf8'),
  certificate = fs.readFileSync(SECURE_CERT, 'utf8')

var credentials = {
  key: privateKey,
  cert: certificate
}

var config = require('./config/token')

config = config['dev'];
mongoose.connect(config.dbURL, config.dbOptions)
mongoose.Promise = global.Promise

const mosca = require('mosca'),
  ascoltatore = {
    type: 'mongo',
    url: 'mongodb://localhost:27017/mqtt',
    pubsubCollection: 'ascoltatori',
    mongo: {}
  },
  settings = {
    backend: ascoltatore,
    http: {
      port: 5000,
      bundle: true
    },
    secure: {
      port: 5443,
      keyPath: SECURE_KEY,
      certPath: SECURE_CERT,
    },
    allowNonSecure: true,
    https: {
      port: 6443,
      bundle: true
    }
  },
  server = new mosca.Server(settings),
  NodeModel = require('./models/Node'),
  DataModel = require('./models/Data'),
  redis = require("redis"),
  rclient = redis.createClient(),
  bluebird = require('bluebird')

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

server.on('clientConnected', function (client) {
  var message = {
    topic: 'client_connected',
    payload: JSON.stringify({
      id: client.id,
      status: 1
    })
  };

  server.publish(message, function () {
    console.log('done!', client.id);
  });



  NodeModel.findByIdAndUpdate({
    _id: client.id
  }, {
    $set: {
      connected: 1
    }
  }, (err, ok) => {

  });

});

server.on('clientDisconnected', function (client) {
  var message = {
    topic: 'client_connected',
    payload: JSON.stringify({
      id: client.id,
      status: 0
    })
  };

  server.publish(message, function () {
    console.log('done!', client.id);
  });

  NodeModel.findByIdAndUpdate({
    _id: client.id
  }, {
    $set: {
      connected: 0
    }
  }, (err, ok) => {

  });
});

async function processValue(topic, val, type) {
  const top = topic + type,
    lastValue = await rclient.getAsync(top)
  let a = null

  if (lastValue) {
    const lastValArr = lastValue.split('_')
    // console.log('OK')
    // if (+lastValArr[0] === val) {
    //   DataModel.findByIdAndUpdate({
    //     _id: lastValArr[1]
    //   }, {
    //     $set: {
    //       lastUpdate: new Date()
    //     }
    //   }, (exx, rr) => {
    //     console.log(exx, rr)
    //   })
    // } else {
    a = new DataModel({
      type: type,
      value: val,
      nodeId: topic
    })
    // console.log('z', a.save())
    // console.log('z', a.save())
    // a.save((err) => {
    //   console.log('vcllllllll', a)
    // })
    // const res = await a.save()
    // console.log(res)
  //  then((z) => {
  //     console.log(z)
  //     rclient.set(top, val + '_' + r._id.toString())
  //   }).catch((err) => {
  //     console.log(err)
  //   })
    a.save((ex, r) => {
      // console.log('err', ex, r)
      if (!ex && r) {
        rclient.set(top, val + '_' + r._id.toString())
      }
    })
    // }
  } else {
    a = new DataModel({
      type: type,
      value: val,
      nodeId: topic
    })
    // a.save((ex, r) => {
    //   console.log(ex, rr)
    //   if (!ex && r) {
    //     rclient.set(top, val + '_' + r._id.toString())
    //   }
    // })
    a.save().then((z) => {
      console.log(z)
      
      rclient.set(top, val + '_' + r._id.toString())
    }).catch(() => {

    })
  }
}

// fired when a message is received
server.on('published', function (packet, client) {
  var str = packet.payload.toString()
  var topic = packet.topic.toString()
  //  console.log(str, topic)
  if (topic.startsWith('NODE_')) {
    rclient.set(topic, str + ' ' + Date.now());
    // console.log('Published', packet.payload.toString());
    var arr = str.split(' ')
    // if (arr)
    if (arr.length >= 3) {
      if (!isNaN(arr[0])) {
        processValue(topic, +arr[0], 0)
      }

      if (!isNaN(arr[1])) {
        processValue(topic, +arr[1], 1)
      }

      if (!isNaN(arr[2])) {
        processValue(topic, +arr[2], 2)
      }
    }
  } else {
    // console.log(topic, 'x')
  }
});

server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
  console.log('Mosca server is up and running');
}