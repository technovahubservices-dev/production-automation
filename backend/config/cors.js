const productionOrigins = ['https://technovahub.in', 'https://www.technovahub.in'];

function corsOptions(env = process.env) {
  const origins = env.NODE_ENV === 'production' ? productionOrigins :
    [...productionOrigins, 'http://localhost:5173', 'http://localhost:5174'];
  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      const error = new Error('Origin is not permitted.'); error.status = 403; callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}

module.exports = { corsOptions };
