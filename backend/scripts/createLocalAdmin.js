require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
async function main() {
  const approvedUri = 'mongodb://127.0.0.1:27018/starlit_local?replicaSet=starlit-local';
  if (process.env.MONGO_URI !== approvedUri) throw new Error('This helper only permits the dedicated starlit_local database on localhost:27018.');
  if (!process.env.LOCAL_ADMIN_PASSWORD || process.env.LOCAL_ADMIN_PASSWORD.length < 12) throw new Error('Set LOCAL_ADMIN_PASSWORD (at least 12 characters) in backend/.env.');
  try {
    await mongoose.connect(approvedUri);
    await User.init();
    if (await User.findOne({ username: 'superadmin' })) { console.log('Local superadmin already exists; credentials were preserved.'); return; }
    await User.create({ name: 'Local Super Admin', username: 'superadmin', password: process.env.LOCAL_ADMIN_PASSWORD, role: 'superadmin', active: true });
    console.log('Created local superadmin. Password is LOCAL_ADMIN_PASSWORD in backend/.env.');
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
