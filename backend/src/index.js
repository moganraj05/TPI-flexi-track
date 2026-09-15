require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const inchargeRoutes = require('./routes/incharge.routes');
const hrRoutes = require('./routes/hr.routes');
const { startReminderScheduler } = require('./services/reminder.service');
const {
  startPollAutomation,
  migrateManualPollsAndShifts,
} = require('./services/poll-automation.service');

// Ensure all models are registered before routes use populate
require('./models/Department');
require('./models/User');
require('./models/Poll');
require('./models/Response');
require('./models/FollowUp');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'FlexiTrack API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/incharge', inchargeRoutes);
app.use('/api/hr', hrRoutes);

app.use(errorHandler);

const startServer = async () => {
  await connectDB();
  await migrateManualPollsAndShifts();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FlexiTrack API running on port ${PORT}`);
    const reminderMs = Number(process.env.REMINDER_CHECK_INTERVAL_MS) || 5 * 60 * 1000;
    const automationMs = Number(process.env.POLL_AUTOMATION_INTERVAL_MS) || 60 * 1000;
    startReminderScheduler(reminderMs);
    startPollAutomation(automationMs);
  });
};

startServer();
