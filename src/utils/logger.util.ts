import fs from 'fs';
import { pino, multistream } from 'pino';
import pretty from 'pino-pretty';
import { env } from '../config/env.config.js';

if (env.nodeEnv === 'local') {
    // Ensure logs directory exists
    if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs');
    }
    // Create logs files if they don't exist
    if (!fs.existsSync('./logs/app.log')) {
        fs.writeFileSync('./logs/app.log', '');
    }
    if (!fs.existsSync('./logs/access.log')) {
        fs.writeFileSync('./logs/access.log', '');
    }
}
// Pretty stream for console
const prettyStream = pretty({
    colorize: true,
    translateTime: 'yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname'
});

const streams =
    env.nodeEnv === 'development'
        ? [
              {
                  stream: fs.createWriteStream('./logs/app.log', { flags: 'a' })
              },
              { stream: prettyStream }
          ]
        : env.nodeEnv === 'test'
          ? []
          : [{ stream: prettyStream }];

export default pino(
    { level: env.nodeEnv === 'test' ? 'silent' : 'info' },
    multistream(streams)
);
