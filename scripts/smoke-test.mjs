// Run only against the disposable Compose test stack; never against the workplace app.
// SMOKE_TEST_ALLOW_WRITE=isolated-test-only SMOKE_BASE_URL=http://formalin-test-app:3003 \
//   node scripts/smoke-test.mjs
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";

class SmokeFailure extends Error {}

function check(condition, message) {
  try {
    assert.ok(condition, message);
  } catch {
    throw new SmokeFailure(message);
  }
}

check(
  process.env.SMOKE_TEST_ALLOW_WRITE === "isolated-test-only",
  "Set SMOKE_TEST_ALLOW_WRITE=isolated-test-only for the disposable test stack.",
);
check(Boolean(process.env.SMOKE_BASE_URL), "SMOKE_BASE_URL must be set explicitly.");
const base = new URL(process.env.SMOKE_BASE_URL);
check(
  ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password &&
    !base.search &&
    !base.hash &&
    base.pathname === "/",
  "SMOKE_BASE_URL must be a root HTTP(S) URL without credentials, query, or fragment.",
);

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const username = `smoke_${runId}`;
const password = randomBytes(24).toString("base64url");
const cookies = new Map();
const sizes = ["25ml中性緩衝", "生検用 30ml", "リンパ節用 40ml"];
const products = ["4580161081521", "4580161081859", "4580161083907"];
const lots = sizes.map((_, i) => `SMOKE-${runId}-${i}`);
const originTime = Date.now();
const t0 = new Date(originTime - 60_000).toISOString();
const t1 = new Date(originTime - 40_000).toISOString();
const t2 = new Date(originTime - 20_000).toISOString();
const dateRange = {
  startDate: new Date(originTime - 2 * 86_400_000).toISOString().slice(0, 10),
  endDate: new Date(originTime + 2 * 86_400_000).toISOString().slice(0, 10),
};
let stage = "preflight";
let userAttempted = false;
let bottlesAttempted = false;
let checksPassed = 0;

function progress(message) {
  stage = message;
  console.log(`[smoke] ${message}`);
}

async function request(path, options = {}, authenticated = true) {
  const headers = new Headers(options.headers);
  if (authenticated && cookies.size) {
    headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
  }
  let response;
  try {
    response = await fetch(new URL(path, base), {
      ...options,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new SmokeFailure(`Request failed: ${options.method ?? "GET"} ${path.split("?")[0]}`);
  }
  if (authenticated) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (/;\s*max-age=0(?:;|$)/i.test(cookie)) cookies.delete(key);
      else cookies.set(key, value);
    }
  }
  return response;
}

async function json(path, method = "GET", body, expectedStatus = 200) {
  const response = await request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  check(
    response.status === expectedStatus,
    `${method} ${path.split("?")[0]} returned ${response.status}; expected ${expectedStatus}.`,
  );
  if (expectedStatus === 204) return undefined;
  try {
    return await response.json();
  } catch {
    throw new SmokeFailure(`${method} ${path.split("?")[0]} did not return JSON.`);
  }
}

async function listLot(index) {
  const query = new URLSearchParams({ includeSubmitted: "true", lotNumber: lots[index] });
  return json(`/api/formalin?${query}`);
}

function bottle(index) {
  return {
    key: "0001",
    place: "病理在庫",
    status: "入庫済み",
    timestamp: t0,
    size: sizes[index],
    expired: "2099-12-31T00:00:00.000Z",
    lotNumber: lots[index],
    boxNumber: "01",
    productCode: products[index],
    updatedBy: username,
    updatedAt: t0,
    oldStatus: "",
    newStatus: "入庫済み",
    oldPlace: "",
    newPlace: "病理在庫",
  };
}

async function exportWorkbook(path) {
  const response = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dateRange),
  });
  check(response.status === 200, `${path} returned ${response.status}; expected 200.`);
  check(
    response.headers.get("content-type")?.includes("spreadsheetml.sheet"),
    `${path} did not return an XLSX content type.`,
  );
  check(
    response.headers.get("content-disposition")?.includes("attachment;"),
    `${path} did not return a download attachment.`,
  );
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  } catch {
    throw new SmokeFailure(`${path} returned an unreadable XLSX workbook.`);
  }
  return workbook;
}

async function cleanup() {
  progress("Removing only this run's temporary records");
  let failed = false;
  if (bottlesAttempted) {
    for (let index = 0; index < lots.length; index += 1) {
      try {
        const result = await listLot(index);
        for (const record of result.items) {
          check(
            record.lot_number === lots[index] &&
              record.key === "0001" &&
              record.box_number === "01" &&
              record.productCode === products[index],
            "Cleanup refused a record without this run's exact test identity.",
          );
          await json(`/api/formalin/${record.id}`, "DELETE", undefined, 204);
          const history = await json(`/api/formalin/${record.id}/history`);
          check(Array.isArray(history) && history.length === 0, "Deleted bottle histories remain.");
        }
        const remaining = await listLot(index);
        check(remaining.total === 0, "Temporary bottle cleanup was incomplete.");
      } catch {
        failed = true;
      }
    }
  }
  if (userAttempted) {
    try {
      const result = await json("/api/delete-user", "DELETE", { username });
      check(result.success === true, "Temporary user cleanup failed.");
      const users = await json("/api/users");
      check(!users.users.includes(username), "Temporary user still exists.");
    } catch {
      failed = true;
    }
  }
  check(!failed, "Cleanup was incomplete; dispose of the isolated Compose test stack.");
}

async function run() {
  progress("Confirming the target database is empty before writing");
  const initial = await json("/api/formalin?includeSubmitted=true&countOnly=true");
  const initialUsers = await json("/api/users");
  check(initial.total === 0, "Refusing to write: the target already contains bottles.");
  check(
    Array.isArray(initialUsers.users) && initialUsers.users.length === 0,
    "Refusing to write: the target already contains users.",
  );
  const loginPage = await request("/login", {}, false);
  check(loginPage.status === 200, "The login page did not load.");
  await loginPage.text();
  const anonymous = await request("/home", {}, false);
  check([302, 303, 307, 308].includes(anonymous.status), "Anonymous /home did not redirect.");
  check(
    new URL(anonymous.headers.get("location"), base).pathname === "/login",
    "Anonymous /home did not redirect to /login.",
  );
  await anonymous.text();
  checksPassed += 1;

  progress("Testing real Credentials login and the authenticated session");
  userAttempted = true;
  const registration = await json("/api/register", "POST", { username, password, isAdmin: true });
  check(registration.success === true, "Test user registration failed.");
  const csrf = await json("/api/auth/csrf");
  check(typeof csrf.csrfToken === "string" && csrf.csrfToken.length > 0, "CSRF token was missing.");
  const login = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      username,
      password,
      callbackUrl: new URL("/home", base).href,
      json: "true",
    }),
  });
  check(login.status === 200, "The Credentials callback failed.");
  await login.text();
  const session = await json("/api/auth/session");
  check(session.user?.username === username, "The authenticated username was incorrect.");
  check(session.user?.isAdmin === true, "The test admin session was incorrect.");
  checksPassed += 1;

  progress("Loading the authenticated application pages");
  for (const path of [
    "/home", "/inbound", "/outbound", "/submission", "/reverse",
    "/list", "/inventory", "/admin", "/backup", "/reconcile",
  ]) {
    const response = await request(path);
    check(response.status === 200, `${path} did not load after login.`);
    check((await response.text()).includes("<html"), `${path} did not return a complete HTML page.`);
  }
  checksPassed += 1;

  progress("Testing individual and bulk inbound registration");
  bottlesAttempted = true;
  const created = await json("/api/formalin", "POST", bottle(0), 201);
  check(Number.isInteger(created.id), "Individual inbound did not return a bottle ID.");
  const bulkCreated = await json("/api/formalin/bulk", "POST", { items: [bottle(1), bottle(2)] }, 201);
  check(bulkCreated.count === 2, "Bulk inbound did not register two bottles.");
  const records = [];
  for (let index = 0; index < lots.length; index += 1) {
    const result = await listLot(index);
    check(result.total === 1 && result.items.length === 1, "An inbound bottle could not be found.");
    check(result.items[0].status === "入庫済み", "An inbound status was incorrect.");
    records.push(result.items[0]);
  }
  checksPassed += 1;

  progress("Testing individual and bulk outbound, submission, and return");
  const outbound = await json(`/api/formalin/${created.id}`, "PUT", {
    status: "出庫済み", place: "検査室", timestamp: t1,
    updatedBy: username, updatedAt: t1,
    oldStatus: "入庫済み", newStatus: "出庫済み",
    oldPlace: "病理在庫", newPlace: "検査室",
  });
  check(outbound.success === true, "Individual outbound failed.");
  const bulkOutbound = await json("/api/formalin/bulk-outbound", "POST", {
    items: records.slice(1).map(({ id }) => ({
      id, place: "検査室", timestamp: t1, updatedBy: username, updatedAt: t1,
    })),
  });
  check(bulkOutbound.count === 2, "Bulk outbound did not update two bottles.");
  const submittedBody = {
    key: "0001", lotNumber: lots[0], boxNumber: "01", productCode: products[0],
    updatedBy: username, returnBy: "",
  };
  const submitted = await json("/api/formalin/submit", "POST", submittedBody);
  check(submitted.success === true && submitted.id === created.id, "Submission failed.");
  const duplicate = await json("/api/formalin/submit", "POST", submittedBody, 409);
  check(duplicate.success === false, "Duplicate submission was not rejected.");
  const returned = await json(`/api/formalin/${records[1].id}`, "PUT", {
    status: "入庫済み", place: "病理在庫", timestamp: t2,
    updatedBy: username, updatedAt: t2,
    oldStatus: "出庫済み", newStatus: "入庫済み",
    oldPlace: "検査室", newPlace: "病理在庫",
  });
  check(returned.success === true, "Return to stock failed.");
  const expectedStatuses = ["提出済み", "入庫済み", "出庫済み"];
  const expectedHistoryCounts = [3, 3, 2];
  for (let index = 0; index < records.length; index += 1) {
    const result = await listLot(index);
    check(result.items[0]?.status === expectedStatuses[index], "A persisted bottle status was incorrect.");
    const history = await json(`/api/formalin/${records[index].id}/history`);
    check(history.length === expectedHistoryCounts[index], "A bottle history count was incorrect.");
    check(history.every((entry) => entry.updated_by === username), "A history author was incorrect.");
  }
  const defaultList = await json("/api/formalin?countOnly=true");
  check(defaultList.total === 2, "The default list did not exclude submitted bottles.");
  checksPassed += 1;

  progress("Checking exact inventory totals and outbound reconciliation");
  const inventory = await json("/api/inventory", "POST", dateRange);
  const expectedTotals = [[1, 1, 0, 1], [1, 0, 1, 0], [1, 1, 0, 0]];
  const fields = ["inCount", "outCount", "stockCount", "submissionCount"];
  for (let index = 0; index < sizes.length; index += 1) {
    for (let field = 0; field < fields.length; field += 1) {
      check(
        inventory[sizes[index]]?.[fields[field]] === expectedTotals[index][field],
        `Inventory ${fields[field]} was incorrect for size ${index + 1}.`,
      );
    }
  }
  const reconcile = await json("/api/inventory/reconcile", "POST", dateRange);
  for (let index = 0; index < sizes.length; index += 1) {
    const entry = reconcile[sizes[index]];
    check(entry?.matches === true, "Outbound reconciliation did not match.");
    check(entry.outCount === expectedTotals[index][1], "Reconciled outbound total was incorrect.");
    check(entry.excelTotal === expectedTotals[index][1], "Reconciled Excel total was incorrect.");
    check(entry.inPeriodReturns === (index === 1 ? 1 : 0), "Return reconciliation was incorrect.");
  }
  checksPassed += 1;

  progress("Reading the backup and both outbound XLSX exports");
  const backup = await exportWorkbook("/api/backup");
  check(backup.worksheets.length === 2, "Backup workbook sheet count was incorrect.");
  const bottleSheet = backup.getWorksheet("ホルマリン一覧");
  const historySheet = backup.getWorksheet("履歴");
  check(bottleSheet?.rowCount === 4, "Backup bottle row count was incorrect.");
  check(historySheet?.rowCount === 9, "Backup history row count was incorrect.");
  for (const lot of lots) {
    let found = false;
    bottleSheet.eachRow((row) => { if (String(row.getCell(1).value).includes(lot)) found = true; });
    check(found, "A test bottle was missing from the backup workbook.");
  }
  for (const path of ["/api/inventory/outbound-details", "/api/inventory/outbound-details/summary"]) {
    const workbook = await exportWorkbook(path);
    check(workbook.worksheets.length === sizes.length, "Outbound workbook sheet count was incorrect.");
    for (let index = 0; index < sizes.length; index += 1) {
      const sheet = workbook.getWorksheet(sizes[index]);
      const expectedRows = index === 1 ? 3 : 4; // title + header + data (if any) + note
      check(sheet?.rowCount === expectedRows, "Outbound export row count was incorrect.");
      if (index === 1) continue;
      check(String(sheet.getCell("A3").value).includes(lots[index]), "An outbound export lot was incorrect.");
      if (path.endsWith("/summary")) {
        check(sheet.getCell("E3").value === 1, "An outbound summary quantity was incorrect.");
      }
    }
  }
  checksPassed += 1;
}

let failure;
try {
  await run();
} catch (error) {
  failure = error instanceof SmokeFailure
    ? `${stage}: ${error.message}`
    : `${stage}: unexpected ${error instanceof Error ? error.name : "error"} (details suppressed).`;
} finally {
  if (userAttempted || bottlesAttempted) {
    try {
      await cleanup();
    } catch (error) {
      failure = `${failure ? `${failure} ` : ""}${error instanceof SmokeFailure ? error.message : "Cleanup failed."}`;
    }
  }
}

if (failure) {
  console.error(`[smoke] FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`[smoke] PASS: ${checksPassed} groups; login, pages, inbound/outbound/submission/return, history, inventory, reconciliation, XLSX, and cleanup verified.`);
}
