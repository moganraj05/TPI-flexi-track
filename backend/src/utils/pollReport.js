const Response = require('../models/Response');
const User = require('../models/User');

const getPollSummary = async (poll, departmentId) => {
  const responses = await Response.find({ poll: poll._id }).populate(
    'user',
    'name employeeId phone shiftStart shiftEnd'
  );
  const yes = responses.filter((r) => r.answer === 'yes');
  const no = responses.filter((r) => r.answer === 'no');

  const respondedUserIds = new Set(responses.filter((r) => r.user).map((r) => r.user._id.toString()));
  const workerFilter = {
    department: departmentId,
    role: 'worker',
    isActive: true,
  };
  if (poll.shiftStart && poll.shiftEnd) {
    workerFilter.shiftStart = poll.shiftStart;
    workerFilter.shiftEnd = poll.shiftEnd;
  }

  const allWorkers = await User.find(workerFilter)
    .select('name employeeId phone shiftStart shiftEnd equipment process incharge')
    .populate('incharge', 'name');

  const rosterFields = (w) => ({
    id: w._id.toString(),
    name: w.name,
    employeeId: w.employeeId,
    phone: w.phone || '',
    shiftStart: w.shiftStart || null,
    shiftEnd: w.shiftEnd || null,
    equipment: w.equipment || '',
    process: w.process || '',
    incharge: w.incharge ? { id: String(w.incharge._id), name: w.incharge.name } : null,
  });

  const pendingWorkers = allWorkers
    .filter((w) => !respondedUserIds.has(w._id.toString()))
    .map((w) => rosterFields(w));

  const teamRoster = allWorkers.map((w) => {
    const response = responses.find((r) => r.user && r.user._id.toString() === w._id.toString());
    if (!response) {
      return { ...rosterFields(w), status: 'pending', answer: null, answeredAt: null };
    }
    return {
      ...rosterFields(w),
      status: response.answer === 'yes' ? 'coming' : 'not_coming',
      answer: response.answer,
      answeredAt: response.answeredAt,
    };
  });

  const totalWorkers = allWorkers.length;
  const responseRate = totalWorkers ? Math.round((responses.length / totalWorkers) * 100) : 0;
  const attendanceRate = totalWorkers ? Math.round((yes.length / totalWorkers) * 100) : 0;

  return {
    totalResponses: responses.length,
    coming: yes.length,
    notComing: no.length,
    totalWorkers,
    pending: pendingWorkers.length,
    pendingWorkers,
    teamRoster,
    responseRate,
    attendanceRate,
    responses: responses
      .filter((r) => r.user)
      .map((r) => ({
        id: r._id.toString(),
        answer: r.answer,
        answeredAt: r.answeredAt,
        user: {
          id: r.user._id.toString(),
          name: r.user.name,
          employeeId: r.user.employeeId,
          phone: r.user.phone || '',
        },
      })),
  };
};

const formatDept = (dept) => {
  if (!dept) return null;
  const id = String(dept._id || dept.id || dept);
  return { _id: id, id, name: dept.name || '', code: dept.code || '' };
};

const formatPoll = (poll) => ({
  id: String(poll._id),
  title: poll.title,
  description: poll.description,
  date: poll.date,
  shift: poll.shift,
  shiftStart: poll.shiftStart || null,
  shiftEnd: poll.shiftEnd || null,
  status: poll.status,
  opensAt: poll.opensAt,
  closesAt: poll.closesAt,
  sendReminder: poll.sendReminder !== false,
  reminderMinutesBefore: poll.reminderMinutesBefore ?? 30,
  reminderSentAt: poll.reminderSentAt ?? null,
  autoCreated: poll.autoCreated !== false,
  department: formatDept(poll.department),
  createdBy: poll.createdBy
    ? { id: String(poll.createdBy._id), name: poll.createdBy.name, employeeId: poll.createdBy.employeeId }
    : null,
  createdAt: poll.createdAt,
});

module.exports = { getPollSummary, formatPoll, formatDept };
