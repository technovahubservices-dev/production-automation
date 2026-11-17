const productionOrigins = [
  'https://technovahub.in',
  'https://www.technovahub.in',
  'https://frontend-seven-silk-lcv373ygdo.vercel.app',
];

function corsOptions(env = process.env) {
  const origins = env.NODE_ENV === 'production' ? productionOrigins :
    [...productionOrigins, 'http://localhost:5173', 'http://localhost:5174'];
  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      const error = new Error('Origin is not permitted.'); error.status = 403; callback(error);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Authentication uses explicitly supplied bearer JWTs, not cookies.
    credentials: false,
  };
}

module.exports = { corsOptions };
