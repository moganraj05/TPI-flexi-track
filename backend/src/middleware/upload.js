const multer = require('multer');

// Memory storage — files never touch disk, we only ever read the buffer
// straight into exceljs (bulk worker import). Small size cap since this is a
// spreadsheet of a few hundred rows at most, not a general file upload.
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only .xlsx Excel files are supported'));
    }
    cb(null, true);
  },
});

module.exports = { excelUpload };
