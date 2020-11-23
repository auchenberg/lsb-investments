require("dotenv").config();

const PersonalCapital = require("personal-capital-sdk").PersonalCapital;
const TwoFactorMode = require("personal-capital-sdk").TwoFactorMode;
const puppeteer = require("puppeteer-core");
const got = require("got");

const args = [
  "--disable-web-security",
  "--disable-features=IsolateOrigins,site-per-process",
];

(async () => {
  console.log("============================");
  console.log("LSB Portfolio scraper");
  console.log("============================");

  console.log("Starting browser...");

  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_KEY}`,
    args,
  });

  console.log("Navigating to LSB...");

  const page = await browser.newPage();
  await page.goto("https://bank.lsb.dk/lsb/netbank/privat/adgang/logon/", {
    waitUntil: "networkidle2",
  });

  console.log("Waiting for NemID...");

  await page.waitForSelector("iframe");

  const frameHandle = await page.$(
    'iframe[src*="https://applet.danid.dk/launcher/lmt"]'
  );

  const frame = await frameHandle.contentFrame();

  console.log("Filling out NemID...");

  // Fill out NemID form
  let elmInputUsername = await frame.waitForSelector(
    `input[aria-labeledby="userid-label"]`
  );

  await elmInputUsername.type(process.env.LSB_USERNAME, {
    delay: 10,
  });

  await frameHandle.press("Tab");

  let elmInputPassword = await frame.waitForSelector(`input[type="password"]`);
  await elmInputPassword.type(process.env.LSB_PASSWORD, {
    delay: 10,
  });

  await frame.click(`button.button--submit`);

  // Trigger 2FA
  console.log("Triggering 2FA for NemID...");

  await frame.waitForSelector(`.nmas h1`);

  await frame.click(`button.button--submit`);

  console.log("Waiting for 2FA to complete...");

  await page.waitForNavigation({
    waitUntil: "networkidle0",
  });

  console.log("2FA completed");

  // Wait until accounts have loaded
  console.log("Waiting for accounts to load...");
  await page.waitForSelector(`.account_accountlist4`);

  // Navigate to BankLink
  console.log("Navigating to investments...");

  await page.goto(
    "https://bank.lsb.dk/lsb/netbank/privat/investering/bank_link/",
    { waitUntil: "networkidle2" }
  );

  // Get portfolio value
  console.log("Getting portfolio values...");

  const portfolioValue = await page.evaluate(
    () =>
      document.querySelector(
        '#banklink tr:not([class]) > td[align="right"] .minitekst'
      ).innerText
  );

  let portfolioValueDKK = portfolioValue.replace(/[,.]/g, (x) => {
    return x == "." ? "" : ".";
  });
  portfolioValueDKK = parseInt(portfolioValueDKK, 10);

  await browser.close();

  console.log("Portfolio value is: ", portfolioValueDKK);

  console.log("Converting DKK to USD");
  const url = `https://api.exchangerate.host/latest?base=DKK&symbols=USD`;
  let req = await got(url);
  const conversionResult = JSON.parse(req.body);
  const conversationRate = conversionResult["rates"]["USD"];
  let portfolioValueUSD = portfolioValueDKK * conversationRate;

  console.log("conversationRate", conversationRate);
  console.log("portfolioValueDKK", portfolioValueDKK);
  console.log("portfolioValueUSD", portfolioValueUSD);

  console.log("Updating Personal Capital");

  // Update PersonalCapital
  let pc = new PersonalCapital();

  try {
    console.log("Logging into Personal Capital");
    await pc.login(process.env.USERNAME, process.env.PASSWORD);
    console.log(".. Success");

    console.log("Updating account balacne");
    await pc.updateInvestmentCashBalance("51066090", portfolioValueUSD);
    console.log(".. Success");

    console.log("Done 👋");
  } catch (err) {
    console.log("err", err);
    if (err.message == "2FA_required") {
      console.log("2FA_required");
      // // await pc.challangeTwoFactor(TwoFactorMode.SMS);
      // await pc.enterTwoFactorCode(TwoFactorMode.SMS, "2104");
      // await pc.login(process.env.USERNAME, process.env.PASSWORD);
    }
  }
})();
