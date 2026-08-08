import morgan from 'morgan';

// Keep local diagnostics without producing an entry for every production request.
export const requestLogger = process.env.NODE_ENV === 'production' ? (_req, _res, next) => next() : morgan('dev');