import { pino } from 'pino';
import pretty from 'pino-pretty';
import { env } from '../config/env.config.js';

// Pretty stream for console
const prettyStream = pretty({
    colorize: true,
    translateTime: 'yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname'
});

export default pino(
    { level: env.nodeEnv === 'test' ? 'silent' : 'info' },
    prettyStream
);
