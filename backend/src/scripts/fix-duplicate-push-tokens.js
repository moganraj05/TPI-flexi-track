require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const dupToken = 'ExponentPushToken[V1RdQcK5EX4JycmlFjacCp]';
  const users = await User.find({ pushToken: dupToken }).select('employeeId updatedAt');

  if (users.length > 1) {
    const keep = users.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await User.updateMany(
      { pushToken: dupToken, _id: { $ne: keep._id } },
      { $unset: { pushToken: 1 } }
    );
    console.log(`Kept token on ${keep.employeeId}, cleared from others`);
  }

  const all = await User.find({ role: 'worker', isActive: true }).select('employeeId pushToken');
  all.forEach((u) => console.log(u.employeeId, u.pushToken ? 'HAS_TOKEN' : 'NO_TOKEN'));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
