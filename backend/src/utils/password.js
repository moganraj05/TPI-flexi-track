const bcrypt = require('bcryptjs');

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// Compared against when a login email doesn't exist, so an unknown email
// takes as long to reject as a wrong password — response timing can't be
// used to discover which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('flexitrack-timing-equalizer', 10);

module.exports = { hashPassword, comparePassword, DUMMY_HASH };
