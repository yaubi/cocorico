var bunyan = require('bunyan');
var request = require('superagent');

var log = bunyan.createLogger({name: 'webhook'});

var RETRY_DELAY = 60 * 1000;  // 1 minute in milliseconds
var RETRY_TTL = 24 * 60 * 60 * 1000;  // 1 day in milliseconds

function isWebhookEvent(content) {
  return !!content.event && !!content.url && !!content.createdAt;
}

require('amqplib/callback_api').connect('amqp://localhost', (err, conn) => {
  if (err) {
    log.error({error: err}, 'Failed to connect to message broker');
    return;
  }

  conn.createChannel((err2, ch) => {
    if (err2) {
      log.error({error: err}, 'Failed to create message channel');
      return;
    }

    ch.consume('cocorico.queue.webhooks', (msg) => {
      msg.content = JSON.parse(msg.content.toString());

      // Delay messages already processed recently
      if (!!msg.content.lastTriedAt) {
        var elapsedTime = Date.now() - msg.content.lastTriedAt;
        if (elapsedTime < RETRY_DELAY) {
          ch.nack(msg);  // append message back to queue
          return;
        }
      }

      // Skip messages failing for too long
      if (!!msg.content.firstTriedAt) {
        var elapsedTime = Date.now() - msg.content.firstTriedAt;
        if (elapsedTime > RETRY_TTL) {
          log.error({ message: msg },
            'Message failed for too long, skipping');
          ch.ack(msg);
          return;
        }
      }

      // Skip invalid messages
      if (!isWebhookEvent(msg.content)) {
        log.error({ message: msg }, 'Invalid message, skipping');
        ch.ack(msg);
        return;
      }

      // Send HTTP request to remote webhook
      log.info({ message: msg }, 'Calling webhook');
      request
        .post(msg.content.url)
        .send({event: msg.content.event})
        .end((err3, res) => {
          if (err3 || res.error) {
            if (err3) {
              log.error({ error: err3 },
                'Failed to call webhook, retrying later');
            } else if (res.error) {
              log.error({ http_status: res.status },
                'Failed to call webhook, retrying later');
            }
            if (!msg.content.firstTriedAt) {
              msg.content.firstTriedAt = Date.now();
            }
            msg.content.lastTriedAt = Date.now();
            // Requeue updated message
            ch.sendToQueue('cocorico.queue.webhooks',
              new Buffer(JSON.stringify(msg.content)),
              { persistent : true }
            )
            ch.ack(msg);
            return;
          }

          log.info({ http_status: res.status },
            'Webhook call succeeded');
          ch.ack(msg);
        })
      ;
    });
  });
});
