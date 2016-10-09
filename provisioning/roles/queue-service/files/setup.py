#!/usr/bin/env python

import logging

import pika
import pyrabbit.api


logging.basicConfig(level=logging.INFO)


# Connect to RabbitMQ, both through HTTP and AMQP

api = pyrabbit.api.Client('localhost:55672', 'guest', 'guest')

connection = pika.BlockingConnection()
channel = connection.channel()


# Queues

logging.info('Deleting queues')
for queue in api.get_queues():
    channel.queue_delete(queue=queue['name'])

logging.info('Creating "votes" queue')
channel.queue_declare(
    queue='cocorico.queue.votes',
    durable=True,
    arguments={
        'x-dead-letter-exchange': 'cocorico.exchange.delay',
    },
)

logging.info('Creating "ballots" queue')
channel.queue_declare(
    queue='cocorico.queue.ballots',
    durable=True,
    arguments={
        'x-dead-letter-exchange': 'cocorico.exchange.delay',
    },
)

logging.info('Creating "webhooks" queue')
channel.queue_declare(
    queue='cocorico.queue.webhooks',
    durable=True,
    arguments={
        'x-dead-letter-exchange': 'cocorico.exchange.delay',
    },
)

logging.info('Creating "delay" queue')
channel.queue_declare(
    queue='cocorico.queue.delay',
    durable=True,
    arguments={
        'x-message-ttl': 60000,  # 1 minute in milliseconds
        'x-dead-letter-exchange': 'cocorico.exchange.direct',
    },
)

logging.info('Creating "alt" queue')
channel.queue_declare(
    queue='cocorico.queue.alt',
    durable=True,
)


# Exchanges

logging.info('Deleting exchanges')
for exchange in api.get_exchanges():
    # Preserve default exchanges
    if exchange['name'].startswith('amqp.') or not exchange['name']:
        continue
    channel.exchange_delete(exchange=exchange['name'])

logging.info('Creating "direct" exchange')
channel.exchange_declare(
    exchange='cocorico.exchange.direct',
    type='direct',
    durable=True,
    arguments={
        'alternate-exchange': 'cocorico.exchange.alt',
    },
)

logging.info('Creating "delay" exchange')
channel.exchange_declare(
    exchange='cocorico.exchange.delay',
    type='fanout',
    durable=True,
)

logging.info('Creating "alt" exchange')
channel.exchange_declare(
    exchange='cocorico.exchange.alt',
    type='fanout',
    durable=True,
)


# Bindings

logging.info('Binding "direct" exchange to "votes" queue')
channel.queue_bind(
    exchange='cocorico.exchange.direct',
    routing_key='cocorico.queue.votes',
    queue='cocorico.queue.votes',
)

logging.info('Binding "direct" exchange to "ballots" queue')
channel.queue_bind(
    exchange='cocorico.exchange.direct',
    routing_key='cocorico.queue.ballots',
    queue='cocorico.queue.ballots',
)

logging.info('Binding "direct" exchange to "webhooks" queue')
channel.queue_bind(
    exchange='cocorico.exchange.direct',
    routing_key='cocorico.queue.webhooks',
    queue='cocorico.queue.webhooks',
)

logging.info('Binding "delay" exchange to "delay" queue')
channel.queue_bind(
    exchange='cocorico.exchange.delay',
    queue='cocorico.queue.delay',
)

logging.info('Binding "alt" exchange to "alt" queue')
channel.queue_bind(
    exchange='cocorico.exchange.alt',
    queue='cocorico.queue.alt',
)
