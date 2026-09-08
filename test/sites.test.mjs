import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSite,
  getSiteProfile,
  BaseSite,
  PttSite,
  Maple3Site,
  AutoSite,
  CHARSETS,
} from '../src/js/sites/index.js';
import {
  EasyReading,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
} from '../src/js/easy_reading.js';
import {
  parseReplyText,
  parsePushInitText,
  parseReqNotMetText,
  parseStatusRow,
  parseListRow,
  parseWaterballRow,
  parseWaterball,
  fnToAid,
  aidToFn,
  isAidc,
} from '../src/js/sites/ptt.js';

test('getSite resolves site profiles correctly with fallback', () => {
  assert.ok(getSite('ptt') instanceof PttSite);
  assert.ok(getSite('maple3') instanceof Maple3Site);
  assert.ok(getSite('auto') instanceof AutoSite);
  assert.ok(getSite('nonexistent-site') instanceof AutoSite);
  assert.ok(getSite(null) instanceof AutoSite);
  assert.equal(getSiteProfile, getSite);
});

test('BaseSite clamps terminal size and computes last row', () => {
  const site = new BaseSite('test-base');
  assert.deepEqual(site.clampTermSize(100, 40), { cols: 100, rows: 40 });

  site.max_cols = 80;
  site.max_rows = 24;
  assert.deepEqual(site.clampTermSize(100, 40), { cols: 80, rows: 24 });

  const mockTerm = { rows: 30, cols: 80 };
  assert.equal(site.getLastRowNum(mockTerm), 29);

  site.fixed_last_row = 23;
  assert.equal(site.getLastRowNum(mockTerm), 23);
});

test('BaseSite detects pass/continue prompt screen', () => {
  const site = new BaseSite();
  const mockTerm1 = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 23 ? '請按任意鍵繼續...' : ''),
  };
  assert.equal(site.isPassScreen(mockTerm1), true);

  const mockTerm2 = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 23 ? '請按 空白鍵 繼續' : ''),
  };
  assert.equal(site.isPassScreen(mockTerm2), true);

  const mockTerm3 = {
    rows: 24,
    cols: 80,
    getRowText: () => '普通文章內容',
  };
  assert.equal(site.isPassScreen(mockTerm3), false);

  const mockTerm4 = {
    rows: 24,
    cols: 80,
    getRowText: () => '內文提到任意鍵三個字但並非提示',
  };
  assert.equal(site.isPassScreen(mockTerm4), false);

  const mockTerm5 = {
    rows: 24,
    cols: 80,
    getRowText: () => ' ◆ 訊息                     [按任意鍵繼續]',
  };
  assert.equal(site.isPassScreen(mockTerm5), true);

  // Maple variations
  const mockTermMaplePack = {
    rows: 24,
    cols: 80,
    getRowText: () => '▄▄▄▄▄ 請按 任意鍵 繼續 ▄▄▄▄▄',
  };
  assert.equal(site.isPassScreen(mockTermMaplePack), true);

  const mockTermMapleCyan = {
    rows: 24,
    cols: 80,
    getRowText: () => '★ 請按 (Space/Return) 繼續 ★',
  };
  assert.equal(site.isPassScreen(mockTermMapleCyan), true);

  const mockTermMapleSpaceFilm = {
    rows: 24,
    cols: 80,
    getRowText: () => '請按 [SPACE] 繼續觀賞，或按其他鍵結束： ',
  };
  assert.equal(site.isPassScreen(mockTermMapleSpaceFilm), true);

  const mockTermEsc = {
    rows: 24,
    cols: 80,
    getRowText: () => '請按 Esc 鍵離開說明',
  };
  assert.equal(site.isPassScreen(mockTermEsc), false);

  // isWaitingForAnyKey
  assert.equal(site.isWaitingForAnyKey(mockTerm1), true);
  assert.equal(site.isWaitingForAnyKey(mockTerm3), false);

  // handlePassScreenClick sends space on pass screen
  const sent = [];
  const mockConn = { send: (s) => sent.push(s) };
  assert.equal(site.handlePassScreenClick(mockTerm1, mockConn), true);
  assert.deepEqual(sent, [' ']);

  // Non-pass screen does not send space
  assert.equal(site.handlePassScreenClick(mockTerm3, mockConn), false);
  assert.deepEqual(sent, [' ']);

  // PTT Site: reading screen and list screen must not be misdetected as pass screen
  const ptt = new PttSite();
  const mockPttReading = {
    rows: 24,
    cols: 80,
    cur_y: 23,
    cur_x: 79,
    getRowText: (r) => (r === 23 ? '  瀏覽 第 1/1 頁 (100%)  目前顯示: 第 01~24 行  (y)回應(X)推文(^X)轉錄 (=[?]說明' : ''),
  };
  assert.equal(ptt.isPassScreen(mockPttReading), false);
  assert.equal(ptt.isWaitingForAnyKey(mockPttReading), false);

  const mockPttList = {
    rows: 24,
    cols: 80,
    cur_y: 23,
    cur_x: 79,
    getRowText: (r) => (r === 23 ? '  文章選讀  (y)回應(X)推文(^X)轉錄 (=[?]說明' : ''),
  };
  assert.equal(ptt.isPassScreen(mockPttList), false);
  assert.equal(ptt.isWaitingForAnyKey(mockPttList), false);

  const mockPttPrompt = {
    rows: 24,
    cols: 80,
    cur_y: 23,
    cur_x: 79,
    getRowText: (r) => (r === 23 ? ' ◆ 訊息                     [按任意鍵繼續]' : ''),
  };
  assert.equal(ptt.isPassScreen(mockPttPrompt), true);
  assert.equal(ptt.isWaitingForAnyKey(mockPttPrompt), true);
});

test('PttSite parses prompt text patterns', () => {
  // Reply prompts
  assert.equal(parseReplyText('▲ 回應至 (F)看板 (M)作者信箱 (B)二者皆是 (Q)取消？[F] '), true);
  assert.equal(parseReplyText('▲ 無法回應至看板。 改回應至 (M)作者信箱 (Q)取消？[Q]'), true);
  assert.equal(parseReplyText('把這篇文章收入到暫存檔？[y/N]'), true);
  assert.equal(parseReplyText('請選擇暫存檔 (0-9)[0]:'), true);
  assert.equal(parseReplyText('一般文章內容'), false);

  // Push comment prompts
  assert.equal(parsePushInitText('您覺得這篇文章 很實用'), true);
  assert.equal(parsePushInitText('→ testuser : 贊成'), true);
  assert.equal(parsePushInitText('很抱歉, 本板不開放回覆文章，要改回信給作者嗎？ [y/N]:'), true);
  assert.equal(parsePushInitText('一般文章內容'), false);

  // Requirement not met
  assert.equal(parseReqNotMetText(' ◆ 未達看板發文限制: 登入次數不足'), true);
  assert.equal(parseReqNotMetText('一般文章內容'), false);
});

test('PttSite parses reading status row', () => {
  const statusMid = '  瀏覽 第 2/10 頁 ( 20%)  目前顯示: 第 024~046 行 (y)回應(X%)推文(h)說明 (←)離開 ';
  const parsedMid = parseStatusRow(statusMid);
  assert.ok(parsedMid);
  assert.equal(parsedMid.pageIndex, 2);
  assert.equal(parsedMid.pageTotal, 10);
  assert.equal(parsedMid.pagePercent, 20);
  assert.equal(parsedMid.rowIndexStart, 24);
  assert.equal(parsedMid.rowIndexEnd, 46);
  assert.equal(parsedMid.isEnd, false);

  const statusEnd = '  瀏覽 第 10/10 頁 (100%)  目前顯示: 第 0200~0220 行 (y)回應(X%)推文(h)說明 (←)離開 ';
  const parsedEnd = parseStatusRow(statusEnd);
  assert.ok(parsedEnd);
  assert.equal(parsedEnd.pagePercent, 100);
  assert.equal(parsedEnd.isEnd, true);

  assert.equal(parseStatusRow('這是普通內文不是狀態列'), null);
});

test('PttSite parses board list status row', () => {
  const validListRow = '[9/7 星期一 15:30] 批踢踢實業坊 線上12345人, 我是hungte [呼叫器]打開 ';
  assert.equal(parseListRow(validListRow), true);

  const closedPagerRow = '[12/31 星期日 23:59] 批踢踢實業坊 線上99999人, 我是guest [呼叫器]關閉 ';
  assert.equal(parseListRow(closedPagerRow), true);

  assert.equal(parseListRow('普通內文'), false);
});

test('PttSite isMenuScreen, isListScreen, isTextWrappedRow, and isLineContinuation handle PTT screens and cursor parking', () => {
  const ptt = new PttSite();
  const base = new BaseSite();

  // Test isMenuScreen
  const mockMenuTerm = {
    rows: 24,
    cols: 80,
    cur_y: 12,
    cur_x: 20,
    getRowText: (r) => {
      if (r === 0) return '【主功能表】 批踢踢實業坊';
      if (r === 23) return '[9/8 星期二 23:45] 批踢踢實業坊 線上12345人, 我是hungte [呼叫器]打開 ';
      return '';
    },
  };
  assert.equal(ptt.isMenuScreen(mockMenuTerm), true);

  // Article reading screen with quoted menu screenshot must NOT be detected as menu (cursor is parked at bottom right)
  const mockArticleWithMenuScreenshot = {
    rows: 24,
    cols: 80,
    cur_y: 23,
    cur_x: 79,
    getRowText: (r) => {
      if (r === 0) return '【主功能表】 批踢踢實業坊';
      if (r === 23) return '  瀏覽 第 1/2 頁 (50%)  目前顯示: 第 01~24 行  (y)回應(X)推文(^X)轉錄 (=[?]說明';
      return '';
    },
  };
  assert.equal(ptt.isMenuScreen(mockArticleWithMenuScreenshot), false);

  // Test isListScreen
  const mockListTerm = {
    rows: 24,
    cols: 80,
    cur_y: 5,
    cur_x: 0,
    getRowText: (r) => {
      if (r === 0) return '【板主:someone】 看板《Gossiping》';
      if (r === 1) return '[←]離開 [→]閱讀 [Ctrl-P]發表文章 [d]刪除 [z]精華區 [i]看板資訊/設定 [h]說明';
      if (r === 2) return '   編號    日 期 作  者       文  章  標  題                     人氣:1234';
      if (r === 23) return '  文章選讀  (y)回應(X)推文(^X)轉錄 (=[]<>)相關主題(/?a)找標題/作者 (b)進板畫面';
      return '';
    },
  };
  assert.equal(ptt.isListScreen(mockListTerm), true);
  // List screen is not menu screen
  assert.equal(ptt.isMenuScreen(mockListTerm), false);

  // Article reading screen with quoted board list screenshot must NOT be detected as list (cursor is parked at bottom right)
  const mockArticleWithListScreenshot = {
    rows: 24,
    cols: 80,
    cur_y: 23,
    cur_x: 79,
    getRowText: (r) => {
      if (r === 0) return '【板主:someone】 看板《Gossiping》';
      if (r === 1) return '[←]離開 [→]閱讀 [Ctrl-P]發表文章 [d]刪除 [z]精華區 [i]看板資訊/設定 [h]說明';
      if (r === 2) return '   編號    日 期 作  者       文  章  標  題                     人氣:1234';
      if (r === 23) return '  瀏覽 第 1/2 頁 (50%)  目前顯示: 第 01~24 行  (y)回應(X)推文(^X)轉錄 (=[?]說明';
      return '';
    },
  };
  assert.equal(ptt.isListScreen(mockArticleWithListScreenshot), false);

  // Cursor parked on right side of screen is not a list cursor
  const mockListWrongCursor = {
    ...mockListTerm,
    cur_x: 40,
    cur_y: 5,
  };
  assert.equal(ptt.isListScreen(mockListWrongCursor), false);

  // Test isTextWrappedRow: looking for bright white on black '\' at col 77 or 78
  const makeLine = (bg, len = 80) => Array.from({ length: len }, () => ({ getBg: () => bg, bg }));
  const wrappedLine = makeLine(0);
  wrappedLine[77] = { ch: '\\', fg: 7, bg: 0, bright: true };
  const termBuf = {
    rows: 5,
    cols: 80,
    lines: [makeLine(0), wrappedLine, makeLine(0), makeLine(0), makeLine(0)],
  };
  assert.equal(ptt.isTextWrappedRow(termBuf, 1), true);

  // Non-wrapped line or wrong color
  const nonWrappedLine = makeLine(0);
  nonWrappedLine[77] = { ch: '\\', fg: 7, bg: 0, bright: false }; // not bright
  termBuf.lines[2] = nonWrappedLine;
  assert.equal(ptt.isTextWrappedRow(termBuf, 2), false);

  // BaseSite isLineContinuation always returns false
  assert.equal(base.isLineContinuation(termBuf, 2, false), false);

  // PttSite isLineContinuation: rowIndex 4 on initial page is always continuation
  assert.equal(ptt.isLineContinuation(termBuf, 4, true), true);

  // PttSite isLineContinuation: rowIndex 2 when row 1 is text-wrapped
  assert.equal(ptt.isLineContinuation(termBuf, 2, false), true);

  // PttSite isLineContinuation: rowIndex 3 when row 2 is NOT text-wrapped
  assert.equal(ptt.isLineContinuation(termBuf, 3, false), false);
});

test('PttSite parses incoming waterball messages', () => {
  const ptt = new PttSite();

  // 1. Direct row parsing with parseWaterballRow
  const rowResult1 = parseWaterballRow('★Sysop 這是測試訊息');
  assert.ok(rowResult1);
  assert.equal(rowResult1.userId, 'Sysop');
  assert.equal(rowResult1.message, '這是測試訊息');

  const rowResultColon = parseWaterballRow('★Sysop: 這是測試訊息');
  assert.ok(rowResultColon);
  assert.equal(rowResultColon.userId, 'Sysop');
  assert.equal(rowResultColon.message, '這是測試訊息');

  const rowResultFullColon = parseWaterballRow('★Sysop：這是測試訊息');
  assert.ok(rowResultFullColon);
  assert.equal(rowResultFullColon.userId, 'Sysop');
  assert.equal(rowResultFullColon.message, '這是測試訊息');

  const rowResultConsecutive = parseWaterballRow('★ 這是連續訊息');
  assert.ok(rowResultConsecutive);
  assert.equal(rowResultConsecutive.userId, undefined);
  assert.equal(rowResultConsecutive.message, '這是連續訊息');

  const rowResultPager = parseWaterballRow('[呼叫] 站長找你');
  assert.ok(rowResultPager);
  assert.equal(rowResultPager.userId, undefined);
  assert.equal(rowResultPager.message, '[呼叫] 站長找你');

  const rowResultPagerBrackets = parseWaterballRow('【呼叫】站長找你');
  assert.ok(rowResultPagerBrackets);
  assert.equal(rowResultPagerBrackets.message, '【呼叫】站長找你');

  assert.equal(parseWaterballRow('普通字串無水球'), null);
  assert.equal(parseWaterballRow('請按任意鍵繼續'), null);
  assert.equal(parseWaterballRow(''), null);
  assert.equal(parseWaterballRow(null), null);

  // 2. TermBuf-based notification parsing
  const mockBufWaterball = {
    rows: 24,
    getRowText(row) {
      return row === 23 ? '★Sysop 嗨' : '';
    }
  };
  const wbResult = ptt.parseNotification(mockBufWaterball);
  assert.ok(wbResult);
  assert.equal(wbResult.userId, 'Sysop');
  assert.equal(wbResult.message, '嗨');

  const mockBufNormal = {
    rows: 24,
    getRowText(row) {
      return row === 23 ? '請按任意鍵繼續' : '';
    }
  };
  assert.equal(ptt.parseNotification(mockBufNormal), null);

  // 3. Legacy string waterball support
  const ansiWaterball = '\x1b[1;33;46m\u2605Sysop\x1b[0;1;37;45m 這是測試訊息 \x1b[m\x1b[K';
  const result1 = parseWaterball(ansiWaterball);
  assert.ok(result1);
  assert.equal(result1.userId, 'Sysop');
  assert.equal(result1.message, '這是測試訊息');

  const siteResult1 = ptt.parseNotification(ansiWaterball);
  assert.ok(siteResult1);
  assert.equal(siteResult1.userId, 'Sysop');
  assert.equal(siteResult1.message, '這是測試訊息');

  const unstyledWaterball = '\x1b[24;01H\x1b[1;37;45m[呼叫] 站長找你\x1b[24;18H\x1b[m';
  const result2 = parseWaterball(unstyledWaterball, 23);
  assert.ok(result2);
  assert.equal(result2.message, '[呼叫] 站長找你');

  assert.equal(parseWaterball('普通字串無水球'), null);
  assert.equal(ptt.parseNotification('普通字串無水球'), null);
  assert.equal(ptt.parseNotification(new Uint8Array([1, 2, 3])), null);
});

test('Maple3Site parses reading status and list patterns', () => {
  const maple3 = new Maple3Site();
  assert.equal(maple3.fixed_last_row, 23);
  assert.equal(maple3.max_rows, 24);

  // Maple3 reading status
  const readingStatus = '  瀏覽 P.1(59%)  (h)求助 [PgUp][PgDn][0][$]移動 (/n)搜尋 (C)暫存 ←(q)結束';
  const parsed1 = maple3.parseReadingStatus(readingStatus);
  assert.ok(parsed1);
  assert.equal(parsed1.pageIndex, 1);
  assert.equal(parsed1.pagePercent, 59);
  assert.equal(parsed1.isEnd, false);

  // Maple3 article end prompt
  const endPrompt = '文章選讀  (y)回應 (=[]<>-+;\')相關主題 (/?)搜尋標題 (aA)搜尋作者';
  const parsedEnd = maple3.parseReadingStatus(endPrompt);
  assert.ok(parsedEnd);
  assert.equal(parsedEnd.pagePercent, 100);
  assert.equal(parsedEnd.isEnd, true);
  assert.equal(maple3.isArticleEnd(endPrompt, null, parsedEnd), true);

  // Maple3 list screen
  const mockTerm = {
    cols: 80,
    getRowText: (r) => (r === 1 ? ' [←]離開 [→]閱讀 [^P]發表 [b]備忘錄 [d]刪除' : ''),
  };
  assert.equal(maple3.isListScreen(mockTerm), true);

  // Anti-idle
  const sent = [];
  maple3.sendAntiIdle({ send: (d) => sent.push(d) });
  assert.deepEqual(sent, ['\x00']);

  // Maple3 parses incoming waterball notification via BaseSite
  const mockBufWaterball = {
    rows: 24,
    getRowText(row) {
      return row === 23 ? '★sysop  hello world ' : '';
    }
  };
  const wbResult = maple3.parseNotification(mockBufWaterball);
  assert.ok(wbResult);
  assert.equal(wbResult.userId, 'sysop');
  assert.equal(wbResult.message, 'hello world');
});

test('AutoSite detects and locks site profile based on Telnet options or explicit lock', () => {
  const auto = new AutoSite();
  assert.ok(auto.getActiveSite() instanceof PttSite);
  assert.equal(auto.isLocked, false);

  // Telnet TELOPT_BINARY (\x00) should lock to PTT
  auto.onTelopt('WILL', '\x00', null);
  assert.equal(auto.isLocked, true);
  assert.ok(auto.getActiveSite() instanceof PttSite);

  // Second lock attempt is ignored once locked
  auto.lockSite('maple3', null);
  assert.ok(auto.getActiveSite() instanceof PttSite);

  // New instance locked to Maple3
  const autoMaple = new AutoSite();
  autoMaple.lockSite('maple3', null);
  assert.equal(autoMaple.isLocked, true);
  assert.ok(autoMaple.getActiveSite() instanceof Maple3Site);
});

test('AutoSite replaces termBuf.site and app.site on lock and proxies calls transparently', () => {
  const auto = new AutoSite();
  const mockApp = { site: auto };
  const mockTerm = {
    cols: 80,
    rows: 24,
    site: auto,
    view: { bbscore: mockApp },
    getRowText: (r) => (r === 0 ? '【主功能表】 批踢踢實業坊' : ''),
  };

  assert.equal(mockTerm.site, auto);
  assert.equal(mockApp.site, auto);

  // Before lock: calling isMenuScreen triggers auto-detection and locks to PTT
  const isMenu = mockTerm.site.isMenuScreen(mockTerm);
  assert.ok(isMenu);

  // After lock: mockTerm.site and mockApp.site are directly replaced with PttSite instance!
  assert.ok(mockTerm.site instanceof PttSite);
  assert.ok(mockApp.site instanceof PttSite);
  assert.notEqual(mockTerm.site, auto);
  assert.notEqual(mockApp.site, auto);

  // External reference to auto still works transparently via Proxy without boilerplate
  assert.equal(auto.name, 'ptt');
  assert.equal(auto.isLocked, true);
  assert.ok(auto.isMenuScreen(mockTerm));
});

test('PttSite AID codec converts filenames and AIDs bidirectionally', () => {
  const pairs = [
    ['M.1786458180.A.4FE', '1gUp14J-'],
    ['M.1786265274.A.5E3', '1gU3wwNZ'],
  ];

  for (const [fn, aid] of pairs) {
    assert.equal(fnToAid(fn), aid);
    assert.equal(aidToFn(aid), fn);
    assert.equal(isAidc(aid), true);
  }

  assert.equal(fnToAid('M.1.A.001')?.length, 8);
  assert.equal(fnToAid('M.1786265274.A.5E3.html'), '1gU3wwNZ');
  assert.equal(fnToAid('M.1786265274.A.5e3'), '1gU3wwNZ');
  assert.equal(aidToFn(fnToAid('M.123.A')), 'M.123.A.000');

  const gAid = fnToAid('G.1786265274.A.5E3');
  assert.equal(aidToFn(gAid), 'G.1786265274.A.5E3');

  assert.equal(fnToAid('M.1786265274.5E3'), null);
  assert.equal(fnToAid('X.1786265274.A.5E3'), null);
  assert.equal(fnToAid('M.1786265274.A.5E3F'), null);
  assert.equal(fnToAid(''), null);
  assert.equal(fnToAid(null), null);

  assert.equal(aidToFn('1gU3wwNZa'), null);
  assert.equal(aidToFn('1gU3wwN'), null);
  assert.equal(aidToFn('1gU3ww.Z'), null);
  assert.equal(aidToFn(''), null);
  assert.equal(aidToFn(null), null);

  assert.equal(aidToFn('1gUp14J-'), 'M.1786458180.A.4FE');
  const withUnderscore = fnToAid('M.4294967295.A.FFF');
  assert.equal(aidToFn(withUnderscore), 'M.4294967295.A.FFF');
});

test('PttSite detects custom links for AID codes in lines', () => {
  const ptt = new PttSite();

  const line1 = '推薦文章請看 #1gU3wwNZ (Browsers) 超級詳細';
  const links1 = ptt.detectCustomLinks(line1, null, null);
  assert.equal(links1.length, 1);
  assert.equal(links1[0].aid, '1gU3wwNZ');
  assert.equal(links1[0].board, 'Browsers');
  assert.equal(links1[0].url, 'https://www.ptt.cc/bbs/Browsers/M.1786265274.A.5E3.html');
  assert.equal(line1.substring(links1[0].start, links1[0].end), '#1gU3wwNZ (Browsers)');

  const line2 = '請參考 #1gUp14J-@SYSOP 說明公告';
  const links2 = ptt.detectCustomLinks(line2, null, null);
  assert.equal(links2.length, 1);
  assert.equal(links2[0].aid, '1gUp14J-');
  assert.equal(links2[0].board, 'SYSOP');
  assert.equal(links2[0].url, 'https://www.ptt.cc/bbs/SYSOP/M.1786458180.A.4FE.html');
  assert.equal(line2.substring(links2[0].start, links2[0].end), '#1gUp14J-@SYSOP');

  const mockTerm = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 0 ? '【板主:admin】         看板《Gossiping》        線上:12345' : ''),
  };
  const line3 = '剛才有人發在 #1gU3wwNZ 趕快去看';
  const links3 = ptt.detectCustomLinks(line3, null, mockTerm);
  assert.equal(links3.length, 1);
  assert.equal(links3[0].aid, '1gU3wwNZ');
  assert.equal(links3[0].board, 'Gossiping');
  assert.equal(links3[0].url, 'https://www.ptt.cc/bbs/Gossiping/M.1786265274.A.5E3.html');

  const line4 = '代碼: #1gU3wwNZ';
  const links4 = ptt.detectCustomLinks(line4, null, null);
  assert.equal(links4.length, 1);
  assert.equal(links4[0].aid, '1gU3wwNZ');
  assert.equal(links4[0].board, null);
  assert.equal(links4[0].url, '#aid=1gU3wwNZ');

  const line5 = '#123 #short #toolongAID123 #FFFFFF ##1gU3wwNZ abc#1gU3wwNZ';
  const links5 = ptt.detectCustomLinks(line5, null, null);
  assert.equal(links5.length, 0);

  const line6 = '※ [本文轉錄自 C_Chat 看板 #1gUp14J- ]';
  const links6 = ptt.detectCustomLinks(line6, null, null);
  assert.equal(links6.length, 1);
  assert.equal(links6[0].aid, '1gUp14J-');
  assert.equal(links6[0].board, 'C_Chat');
  assert.equal(links6[0].url, 'https://www.ptt.cc/bbs/C_Chat/M.1786458180.A.4FE.html');

  // Article reading screen header: 作者 ... 看板 Gossiping
  const mockTermArticle = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 0 ? '作者  someone (nick)                                         看板  Gossiping' : ''),
  };
  const line7 = '請看這篇 #1gU3wwNZ 討論';
  const links7 = ptt.detectCustomLinks(line7, null, mockTermArticle);
  assert.equal(links7.length, 1);
  assert.equal(links7[0].aid, '1gU3wwNZ');
  assert.equal(links7[0].board, 'Gossiping');
  assert.equal(links7[0].url, 'https://www.ptt.cc/bbs/Gossiping/M.1786265274.A.5E3.html');

  // Bracket notation: #AID [Board]
  const line8 = '參考資料 #1gU3wwNZ [Browsers]';
  const links8 = ptt.detectCustomLinks(line8, null, null);
  assert.equal(links8.length, 1);
  assert.equal(links8[0].aid, '1gU3wwNZ');
  assert.equal(links8[0].board, 'Browsers');
  assert.equal(links8[0].url, 'https://www.ptt.cc/bbs/Browsers/M.1786265274.A.5E3.html');

  // AutoSite forwards detectCustomLinks and retains currentBoard across scrolled pages
  const auto = new AutoSite();
  auto.detectCustomLinks('第一頁標頭', null, mockTermArticle);
  const mockTermPage2 = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 0 ? '內文第二頁沒有看板資訊' : ''),
  };
  const linksAuto = auto.detectCustomLinks('第二頁推文提到 #1gU3wwNZ 推薦閱讀', null, mockTermPage2);
  assert.equal(linksAuto.length, 1);
  assert.equal(linksAuto[0].aid, '1gU3wwNZ');
  assert.equal(linksAuto[0].board, 'Gossiping');
  assert.equal(linksAuto[0].url, 'https://www.ptt.cc/bbs/Gossiping/M.1786265274.A.5E3.html');
});

test('PttSite and AutoSite handleCustomLink execute in-terminal AID jumps and pass web links', () => {
  const ptt = new PttSite();
  const auto = new AutoSite();
  let sentData = '';
  let focused = false;
  const mockApp = {
    conn: {
      send: (data) => {
        sentData += data;
      },
    },
    setInputAreaFocus: () => {
      focused = true;
    },
  };

  // Boardless AID link sends keystroke into terminal
  assert.equal(ptt.handleCustomLink('#aid=1gU3wwNZ', mockApp), true);
  assert.equal(sentData, '#1gU3wwNZ\r');
  assert.equal(focused, true);

  // Resolved URL with hash also handled
  sentData = '';
  focused = false;
  assert.equal(ptt.handleCustomLink('https://term.ptt.cc/#aid=1gU3wwNZ', mockApp), true);
  assert.equal(sentData, '#1gU3wwNZ\r');
  assert.equal(focused, true);

  // AutoSite transparently proxies handleCustomLink
  sentData = '';
  focused = false;
  assert.equal(auto.handleCustomLink('#aid=1gUp14J-', mockApp), true);
  assert.equal(sentData, '#1gUp14J-\r');
  assert.equal(focused, true);

  // Web page link with board is not intercepted (let browser open page)
  sentData = '';
  assert.equal(ptt.handleCustomLink('https://www.ptt.cc/bbs/Gossiping/M.1786265274.A.5E3.html', mockApp), false);
  assert.equal(sentData, '');

  // BaseSite defaults to false
  const base = new BaseSite();
  assert.equal(base.handleCustomLink('#aid=1gU3wwNZ', mockApp), false);

  // Null/empty inputs safely return false
  assert.equal(ptt.handleCustomLink(null, mockApp), false);
  assert.equal(ptt.handleCustomLink('', mockApp), false);
  assert.equal(ptt.handleCustomLink('#aid=123', mockApp), false);
});

test('BaseSite resolves URLs including pid:// scheme', () => {
  const site = new BaseSite();
  assert.equal(site.resolveUrl('pid://12345678'), 'https://www.pixiv.net/artworks/12345678');
  assert.equal(site.resolveUrl('https://example.com/test'), 'https://example.com/test');
  assert.equal(site.resolveUrl('http://ptt.cc'), 'http://ptt.cc');
});

test('CHARSETS defines pre-defined constants and BaseSite handles isUtf8 without toUpper', () => {
  assert.equal(CHARSETS.BIG5, 'big5');
  assert.equal(CHARSETS.UTF8, 'utf-8');

  // BaseSite defaults to BIG5
  const base = new BaseSite();
  assert.equal(base.charset, CHARSETS.BIG5);
  assert.equal(base.isUtf8, false);

  // Set to UTF-8 via pre-defined constant
  base.charset = CHARSETS.UTF8;
  assert.equal(base.charset, CHARSETS.UTF8);
  assert.equal(base.isUtf8, true);

  // Set to uppercase string 'UTF-8' canonicalizes to CHARSETS.UTF8
  base.charset = 'UTF-8';
  assert.equal(base.charset, CHARSETS.UTF8);
  assert.equal(base.isUtf8, true);

  // Set back to 'big5'
  base.charset = 'big5';
  assert.equal(base.charset, CHARSETS.BIG5);
  assert.equal(base.isUtf8, false);

  // PttSite and Maple3Site default to Big5
  const ptt = new PttSite();
  assert.equal(ptt.charset, CHARSETS.BIG5);
  assert.equal(ptt.isUtf8, false);

  const maple = new Maple3Site();
  assert.equal(maple.charset, CHARSETS.BIG5);
  assert.equal(maple.isUtf8, false);

  // AutoSite proxies charset and isUtf8
  const auto = new AutoSite();
  assert.equal(auto.charset, CHARSETS.BIG5);
  assert.equal(auto.isUtf8, false);
});

test('BaseSite findContentOverlap detects suffix-prefix line matches', () => {
  const base = new BaseSite();
  const makeLine = (text) => text.split('').map((ch) => ({ ch }));

  // Helper to construct termBuf mock
  const createMockTerm = (lines) => ({
    lines: lines.map(makeLine),
    cols: 80,
    rows: 24,
  });

  const pageLines = [
    makeLine('Line 1'),
    makeLine('Line 2'),
    makeLine('Line 3 (wrapped part 1)'),
    makeLine('Line 3 (wrapped part 2)'),
  ];

  // Screen matches the last 2 lines of pageLines
  const termBuf = createMockTerm([
    'Line 3 (wrapped part 1)',
    'Line 3 (wrapped part 2)',
    'Line 4',
    'Line 5',
  ]);

  const overlap = base.findContentOverlap(termBuf, 23, pageLines);
  assert.equal(overlap, 2);

  // When no overlap matches
  const termBufNoMatch = createMockTerm([
    'Completely different 1',
    'Completely different 2',
  ]);
  assert.equal(base.findContentOverlap(termBufNoMatch, 23, pageLines), 0);

  // When pageLines is empty
  assert.equal(base.findContentOverlap(termBuf, 23, []), 0);
  assert.equal(base.findContentOverlap(termBuf, 23, null), 0);
});

test('PttSite getPagingSlice uses content-based overlap deduplication', () => {
  const ptt = new PttSite();
  const makeLine = (text) => text.split('').map((ch) => ({ ch }));

  const page1Lines = [
    makeLine('Author: hungte'),
    makeLine('Title: Test Post'),
    makeLine('Body line 1'),
    makeLine('Body line 2'),
  ];

  const termBuf = {
    lines: [
      makeLine('Body line 1'),
      makeLine('Body line 2'),
      makeLine('Body line 3 (new)'),
      makeLine('Body line 4 (new)'),
    ],
    pageLines: page1Lines,
    cols: 80,
    rows: 24,
    getRowText: () => '',
  };

  const paging = ptt.getPagingSlice(termBuf, null, 2);
  assert.equal(paging.beginIndex, 2);
  assert.equal(paging.atLastPage, true);
});

test('EasyReading in-flight control prevents multiple concurrent PageDowns', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (k) => JSON.stringify({ values: { enableEasyReading: true } }),
      setItem: () => {},
      removeItem: () => {},
    },
  };

  try {
    const ptt = new PttSite();
    const sentCommands = [];

    class MockTarget {
      constructor() {
        this._listeners = {};
      }
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      }
      dispatchEvent(evt) {
        const list = this._listeners[evt.type] || [];
        for (const fn of list) fn(evt);
      }
    }

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
    };

    const mockView = {
      useEasyReadingMode: true,
      conn: {
        send: (cmd) => sentCommands.push(cmd),
      },
      hideEasyReading: () => {},
    };

    const mockTermBuf = Object.assign(new MockTarget(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
      prevPageState: 0,
      pageState: 3,
      site: ptt,
      lines: Array.from({ length: 24 }, () => []),
      statusText: '  瀏覽 第 1/3 頁 ( 33%)  目前顯示: 第 01~22 行 (y)回應(X%)推文(h)說明 (←)離開 ',
      getRowText(row) {
        return row === 23 ? this.statusText : '';
      },
      isFrameReady() {
        return this.site.isCursorParked(this);
      },
    });

    const easyReading = new EasyReading(mockCore, mockView, mockTermBuf);
    assert.equal(easyReading._pageDownInFlight, false);

    // 1. Initial entry to reading mode triggers first PageDown
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.sendCommandAfterUpdate, '\x1b[6~');
    assert.equal(easyReading._pageDownInFlight, true);
    assert.equal(easyReading._lastRequestedPageIndex, 1);

    // Simulate view update: command sent
    mockTermBuf.dispatchEvent({ type: 'viewUpdate' });
    assert.deepEqual(sentCommands, ['\x1b[6~']);
    assert.equal(easyReading.sendCommandAfterUpdate, '');
    assert.equal(easyReading._pageDownInFlight, true);
    mockTermBuf.prevPageState = 3;

    // 2. While in-flight, duplicate updates for same page must NOT trigger another PageDown
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.sendCommandAfterUpdate, '');
    assert.equal(easyReading._pageDownInFlight, true);

    // 3. Server delivers page 2 -> advances page, clears in-flight, queues next PageDown
    mockTermBuf.prevPageState = 3;
    mockTermBuf.statusText = '  瀏覽 第 2/3 頁 ( 66%)  目前顯示: 第 21~42 行 (y)回應(X%)推文(h)說明 (←)離開 ';
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading._pageDownInFlight, true);
    assert.equal(easyReading._lastRequestedPageIndex, 2);
    assert.equal(easyReading.sendCommandAfterUpdate, '\x1b[6~');

    mockTermBuf.dispatchEvent({ type: 'viewUpdate' });
    assert.deepEqual(sentCommands, ['\x1b[6~', '\x1b[6~']);

    // 4. Server delivers final page (100%) -> completes easy reading, no more PageDown
    mockTermBuf.statusText = '  瀏覽 第 3/3 頁 (100%)  目前顯示: 第 41~60 行 (y)回應(X%)推文(h)說明 (←)離開 ';
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.easyReadingReachedPageEnd, true);
    assert.equal(easyReading._pageDownInFlight, false);
    assert.equal(easyReading.sendCommandAfterUpdate, '');

    // 5. Leaving post resets state
    easyReading.leaveCurrentPost();
    assert.equal(easyReading._pageDownInFlight, false);
    assert.equal(easyReading._lastRequestedPageIndex, null);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('EasyReading in-flight watchdog handles dropped response with retries and boundary reset', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (k) => JSON.stringify({ values: { enableEasyReading: true } }),
      setItem: () => {},
      removeItem: () => {},
    },
  };

  try {
    const ptt = new PttSite();
    const sentCommands = [];

    class MockTarget {
      constructor() {
        this._listeners = {};
      }
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      }
      dispatchEvent(evt) {
        const list = this._listeners[evt.type] || [];
        for (const fn of list) fn(evt);
      }
    }

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
    };

    const mockView = {
      useEasyReadingMode: true,
      conn: {
        send: (cmd) => sentCommands.push(cmd),
      },
      hideEasyReading: () => {},
    };

    const mockTermBuf = Object.assign(new MockTarget(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
      prevPageState: 0,
      pageState: 3,
      site: ptt,
      lines: Array.from({ length: 24 }, () => []),
      statusText: '  瀏覽 第 1/3 頁 ( 33%)  目前顯示: 第 01~22 行 (y)回應(X%)推文(h)說明 (←)離開 ',
      getRowText(row) {
        return row === 23 ? this.statusText : '';
      },
      isFrameReady() {
        return this.site.isCursorParked(this);
      },
    });

    const easyReading = new EasyReading(mockCore, mockView, mockTermBuf);

    // Initial page: PageDown queued
    mockTermBuf.dispatchEvent({ type: 'change' });
    mockTermBuf.dispatchEvent({ type: 'viewUpdate' });
    assert.deepEqual(sentCommands, ['\x1b[6~']);
    assert.equal(easyReading._pageDownInFlight, true);
    assert.ok(easyReading._inFlightTimer !== null);
    assert.equal(easyReading._inFlightRetries, 0);

    // Simulate dropped server packet / typeahead drop: watchdog fires timeout 1
    easyReading._onInFlightTimeout();
    assert.deepEqual(sentCommands, ['\x1b[6~', '\x1b[6~']);
    assert.equal(easyReading._inFlightRetries, 1);
    assert.equal(easyReading._pageDownInFlight, true);
    assert.ok(easyReading._inFlightTimer !== null);

    // Watchdog fires timeout 2 (second retry)
    easyReading._onInFlightTimeout();
    assert.deepEqual(sentCommands, ['\x1b[6~', '\x1b[6~', '\x1b[6~']);
    assert.equal(easyReading._inFlightRetries, 2);
    assert.equal(easyReading._pageDownInFlight, true);

    // Watchdog fires timeout 3 (max retries reached): boundary guard resets in-flight
    easyReading._onInFlightTimeout();
    assert.equal(easyReading._pageDownInFlight, false);
    assert.equal(easyReading._inFlightRetries, 0);
    assert.equal(easyReading._inFlightTimer, null);

    // Verify leaving post cleans up timer
    easyReading._armInFlightWatchdog();
    assert.ok(easyReading._inFlightTimer !== null);
    easyReading.leaveCurrentPost();
    assert.equal(easyReading._inFlightTimer, null);
    assert.equal(easyReading._pageDownInFlight, false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('PttSite isCursorParked requires cursor at bottom-right corner', () => {
  const ptt = new PttSite();

  const legacyBuf = {
    cols: 80,
    rows: 24,
    cur_x: 79,
    cur_y: 23,
  };
  assert.equal(ptt.isCursorParked(legacyBuf), true);
  legacyBuf.cur_x = 0;
  assert.equal(ptt.isCursorParked(legacyBuf), false);
  legacyBuf.cur_x = 79;
  legacyBuf.cur_y = 10;
  assert.equal(ptt.isCursorParked(legacyBuf), false);
});

test('EasyReading captures complete frames with DEC 2026 synchronized update', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: () => JSON.stringify({ values: { enableEasyReading: true } }),
      setItem: () => {},
      removeItem: () => {},
    },
  };

  try {
    const ptt = new PttSite();
    const sentCommands = [];

    class MockTarget {
      constructor() {
        this._listeners = {};
      }
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      }
      dispatchEvent(evt) {
        const list = this._listeners[evt.type] || [];
        for (const fn of list) fn(evt);
      }
    }

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
    };

    const mockView = {
      useEasyReadingMode: true,
      conn: {
        send: (cmd) => sentCommands.push(cmd),
      },
      hideEasyReading: () => {},
    };

    // Note: cursor parked at column 15 instead of legacy 79
    const mockTermBuf = Object.assign(new MockTarget(), {
      cols: 80,
      rows: 24,
      cur_x: 15,
      cur_y: 23,
      prevPageState: 0,
      pageState: 3,
      site: ptt,
      hasFrameSync: true,
      inSyncUpdate: false,
      isFrameReady() {
        if (this.hasFrameSync) return !this.inSyncUpdate;
        return this.site.isCursorParked(this);
      },
      lines: Array.from({ length: 24 }, () => []),
      statusText: '  瀏覽 第 1/3 頁 ( 33%)  目前顯示: 第 01~22 行 (y)回應(X%)推文(h)說明 (←)離開 ',
      getRowText(row) {
        return row === 23 ? this.statusText : '';
      },
    });

    const easyReading = new EasyReading(mockCore, mockView, mockTermBuf);

    // Initial frame arrives: triggers PageDown even though cur_x is 15 (not 79)
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.sendCommandAfterUpdate, '\x1b[6~');
    assert.equal(easyReading._pageDownInFlight, true);

    mockTermBuf.dispatchEvent({ type: 'viewUpdate' });
    assert.deepEqual(sentCommands, ['\x1b[6~']);

    // When next frame is still in progress (inSyncUpdate = true), change event ignores it
    mockTermBuf.inSyncUpdate = true;
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.sendCommandAfterUpdate, '');

    // Frame finishes (inSyncUpdate = false) with page 2
    mockTermBuf.inSyncUpdate = false;
    mockTermBuf.statusText = '  瀏覽 第 2/3 頁 ( 66%)  目前顯示: 第 21~42 行 (y)回應(X%)推文(h)說明 (←)離開 ';
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.sendCommandAfterUpdate, '\x1b[6~');

    mockTermBuf.dispatchEvent({ type: 'viewUpdate' });
    assert.deepEqual(sentCommands, ['\x1b[6~', '\x1b[6~']);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('EasyReading encapsulates overlay DOM elements and page stitching', () => {
  function createElement(tag) {
    const listeners = {};
    return {
      tagName: tag.toUpperCase(),
      style: {},
      childNodes: [],
      parentNode: null,
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k]; },
      addEventListener(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
      dispatchEvent(evt) { for (const fn of (listeners[evt.type] || [])) fn(evt); },
      appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          this.childNodes.splice(idx, 1);
        }
        return child;
      },
      get lastChild() { return this.childNodes[this.childNodes.length - 1]; },
      set innerHTML(html) {
        this._html = html;
        if (html === '') this.childNodes = [];
      },
      get innerHTML() { return this._html || ''; },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentNode;
        }
        return false;
      },
    };
  }

  const container = createElement('div');
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement,
      getElementById: (id) => (id === 'TermWindow' ? container : null),
    };

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
    };
    const renderedRows = [];
    const mockView = {
      termWin: container,
      chh: 16,
      renderRow: (line, row, chh, preview, el) => {
        renderedRows.push({ line, row });
      },
    };
    const ptt = new PttSite();
    const mockTermBuf = {
      cols: 80,
      rows: 24,
      addEventListener: () => {},
      site: ptt,
    };

    const easyReading = new EasyReading(mockCore, mockView, mockTermBuf);
    assert.ok(easyReading.overlay);
    assert.equal(easyReading.overlay.getAttribute('id'), 'easyReadingOverlay');
    assert.ok(easyReading.content);
    assert.equal(easyReading.content.getAttribute('id'), 'easyReadingContent');
    assert.ok(easyReading.footer);
    assert.equal(easyReading.footer.getAttribute('id'), 'easyReadingFooter');
    assert.ok(easyReading.lastRowDiv);
    assert.equal(easyReading.lastRowDiv.getAttribute('id'), 'easyReadingLastRow');
    assert.ok(easyReading.replyRowDiv);
    assert.equal(easyReading.replyRowDiv.getAttribute('id'), 'easyReadingReplyRow');

    assert.equal(easyReading.isActive(), false);
    easyReading.show();
    assert.equal(easyReading.isActive(), true);
    assert.equal(easyReading.overlay.style.display, 'block');

    easyReading.appendRows([['a', 'b'], ['c', 'd']], false);
    assert.equal(renderedRows.length, 2);
    assert.equal(easyReading.content.childNodes.length, 2);

    easyReading.clearRows();
    assert.equal(easyReading.content.childNodes.length, 0);

    easyReading.hide();
    assert.equal(easyReading.isActive(), false);
    assert.equal(easyReading.overlay.style.display, 'none');
  } finally {
    globalThis.document = originalDoc;
  }
});





