module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
 
  try {
    // Проверка переменных окружения
    const hasServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT;
    const hasSpreadsheetId = !!process.env.SPREADSHEET_ID;
   
    let jsonParsed = false;
    let parseError = null;
   
    if (hasServiceAccount) {
      try {
        JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        jsonParsed = true;
      } catch (e) {
        parseError = e.message;
      }
    }
   
    res.json({
      success: true,
      message: 'Test endpoint works!',
      env: {
        hasServiceAccount,
        hasSpreadsheetId,
        jsonParsed,
        parseError
      },
      timestamp: new Date().toISOString()
    });
   
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
