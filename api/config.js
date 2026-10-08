// Tells the page whether it needs to ask for a study code.
module.exports = (req, res) => {
  res.status(200).json({ codeRequired: !!process.env.STUDY_CODE });
};
