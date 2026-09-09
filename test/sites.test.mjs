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
    view: { app: mockApp },
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
    send: (data) => {
      sentData += data;
    },
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
      send: (cmd) => sentCommands.push(cmd),
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
      send: (cmd) => sentCommands.push(cmd),
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
      send: (cmd) => sentCommands.push(cmd),
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

test('EasyReading decouples state tracking and removes TermBuf property injection', () => {
  const mockCore = {
    connectedUrl: { easyReadingSupported: true },
    suppressInertialWheel: () => {},
  };
  const mockView = {
    chh: 16,
    useEasyReadingMode: true,
  };
  const mockTermBuf = {
    cols: 80,
    rows: 24,
    addEventListener: () => {},
  };

  const easyReading = new EasyReading(mockCore, mockView, mockTermBuf);

  // EasyReading owns its own state
  assert.equal(easyReading.enabled, true);
  assert.equal(easyReading.isStarted(), false);
  assert.equal(easyReading.isPromptActive(), false);

  easyReading.started = true;
  assert.equal(easyReading.isStarted(), true);

  easyReading.showReplyText = true;
  assert.equal(easyReading.isPromptActive(), true);
  assert.equal(easyReading.isReplyActive(), true);

  easyReading.showReplyText = false;
  easyReading.showPushInitText = true;
  assert.equal(easyReading.isPromptActive(), true);
  assert.equal(easyReading.isPushInitActive(), true);

  // TermBuf was not monkey-patched with non-configurable Object.defineProperty
  const desc = Object.getOwnPropertyDescriptor(mockTermBuf, 'startedEasyReading');
  assert.equal(desc, undefined); // It was not defined directly on mockTermBuf!

  easyReading.pageLines = [['line1']];
  easyReading.pageWrappedLines = [1, 2];
  easyReading.hide();
  assert.deepEqual(easyReading.pageLines, []);
  assert.deepEqual(easyReading.pageWrappedLines, []);
});

test('EasyReading and App input interceptor pipeline decouples navigation, wheel, keydown, and text input', () => {
  const sent = [];
  const mockCore = {
    inputInterceptors: [],
    site: {
      getThreadCommand: (type) => (type === 'prevThread' ? '\x1b[D\x1b[A\x1b[C' : '\x1b[D\x1b[B\x1b[C'),
    },
    send: (data) => sent.push(data),
    suppressInertialWheel: (duration) => { mockCore.lastSuppressedDuration = duration; },
  };

  mockCore.registerInputInterceptor = (interceptor) => {
    if (!interceptor || mockCore.inputInterceptors.includes(interceptor)) return;
    mockCore.inputInterceptors.push(interceptor);
  };
  mockCore.unregisterInputInterceptor = (interceptor) => {
    const idx = mockCore.inputInterceptors.indexOf(interceptor);
    if (idx !== -1) mockCore.inputInterceptors.splice(idx, 1);
  };
  mockCore.dispatchNavCmd = (cmd) => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.handleNavCmd?.(cmd)) return true;
    }
    return false;
  };
  mockCore.dispatchWheel = (e) => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.handleWheel) {
        const res = interceptor.handleWheel(e);
        if (res) return res;
      }
    }
    return false;
  };
  mockCore.dispatchKeyDown = (e) => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.handleKeyDown?.(e)) return true;
      if (e.defaultPrevented) return true;
    }
    return false;
  };
  mockCore.dispatchTextInput = (e) => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.handleTextInput?.(e)) return true;
    }
    return false;
  };
  mockCore.getInterceptorSelectedText = () => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.getSelectedText) {
        const text = interceptor.getSelectedText();
        if (text !== undefined && text !== null) return text;
      }
    }
    return null;
  };
  mockCore.getInterceptorSelectionColRow = () => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.getSelectionColRow) {
        const res = interceptor.getSelectionColRow();
        if (res !== undefined) return res;
      }
    }
    return undefined;
  };
  mockCore.dispatchSelectAll = () => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.selectAll?.()) return true;
    }
    return false;
  };
  mockCore.hasActiveInputInterceptor = () => {
    for (const interceptor of mockCore.inputInterceptors) {
      if (interceptor.isActive?.()) return true;
    }
    return false;
  };

  const mockTermBuf = {
    site: mockCore.site,
    addEventListener: () => {},
  };
  const mockView = {
    useEasyReadingMode: true,
    chh: 16,
    conn: { send: (d) => sent.push(d) },
  };

  const easyReading = new EasyReading(mockCore, mockView, mockTermBuf);
  assert.ok(mockCore.inputInterceptors.includes(easyReading));

  // 1. Inactive: interceptor returns false / undefined
  assert.equal(easyReading.isActive(), false);
  assert.equal(mockCore.hasActiveInputInterceptor(), false);
  assert.equal(mockCore.dispatchNavCmd('doArrowUp'), false);
  assert.equal(mockCore.dispatchWheel({ deltaY: 100 }), false);
  assert.equal(mockCore.getInterceptorSelectedText(), null);
  assert.equal(mockCore.getInterceptorSelectionColRow(), undefined);
  assert.equal(mockCore.dispatchSelectAll(), false);

  // 2. Active mode
  easyReading._overlay = { style: { display: 'block' } };
  easyReading._content = { scrollTop: 0, scrollHeight: 500, clientHeight: 200 };
  easyReading.enabled = true;
  easyReading.started = true;
  assert.equal(easyReading.isActive(), true);
  assert.equal(mockCore.hasActiveInputInterceptor(), true);

  // Wheel handling when active: returns true and updates lastWheelTime
  const wheelRes = mockCore.dispatchWheel({ deltaY: 50 });
  assert.equal(wheelRes, true);
  assert.ok(easyReading.lastWheelTime > 0);

  // Navigation commands when active
  // doArrowDown: scrollable, scrolls by 1 line (16px) and returns true without sending terminal keys
  const navDown = mockCore.dispatchNavCmd('doArrowDown');
  assert.equal(navDown, true);
  assert.equal(easyReading._content.scrollTop, 16);
  assert.equal(sent.length, 0);

  // doArrowUp: scrollable (scrollTop=16), scrolls up by 1 line to 0
  const navUp = mockCore.dispatchNavCmd('doArrowUp');
  assert.equal(navUp, true);
  assert.equal(easyReading._content.scrollTop, 0);
  assert.equal(sent.length, 0);

  // doArrowUp again at scrollTop=0: cannot scroll further, leaves current post and sends escape sequence
  const navUpBoundary = mockCore.dispatchNavCmd('doArrowUp');
  assert.equal(navUpBoundary, true);
  assert.deepEqual(sent, ['\x1b[D\x1b[A\x1b[C']);
  sent.length = 0;

  // previousThread / nextThread
  mockCore.dispatchNavCmd('nextThread');
  assert.deepEqual(sent, ['\x1b[D\x1b[B\x1b[C']);
  sent.length = 0;

  // KeyDown and text input handling (Chinese IME composition suppression)
  const keyDownEvent = { keyCode: 229, isComposing: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  mockCore.dispatchKeyDown(keyDownEvent);
  assert.equal(easyReading._keyDownKeyCode, 229);
  assert.equal(easyReading._keyDownIsComposing, true);

  const textInputEvent = { target: { value: '注' } };
  const inputHandled = mockCore.dispatchTextInput(textInputEvent);
  assert.equal(inputHandled, true);
  assert.equal(textInputEvent.target.value, ''); // Swallowed composition string!

  // Selection col/row is null during easy reading (grid coordinates suppressed)
  assert.equal(mockCore.getInterceptorSelectionColRow(), null);

  // Wheel suppression upon exit
  easyReading.hide();
  assert.equal(easyReading.isActive(), false);
  // Recently scrolled in EasyReading: dispatchWheel returns 'suppress'
  const suppressedWheel = mockCore.dispatchWheel({ deltaY: 50 });
  assert.equal(suppressedWheel, 'suppress');

  // Unregister interceptor
  mockCore.unregisterInputInterceptor(easyReading);
  assert.equal(mockCore.inputInterceptors.includes(easyReading), false);
});

test('EasyReadingPlugin lifecycle: init, destroy, screen update, and font update hooks', () => {
  const mockApp = {
    plugins: [],
    inputInterceptors: [],
    registerInputInterceptor(interceptor) {
      if (!interceptor || this.inputInterceptors.includes(interceptor)) return;
      this.inputInterceptors.push(interceptor);
    },
    unregisterInputInterceptor(interceptor) {
      const idx = this.inputInterceptors.indexOf(interceptor);
      if (idx !== -1) this.inputInterceptors.splice(idx, 1);
    },
    registerPlugin(plugin) {
      if (!plugin || this.plugins.includes(plugin)) return;
      this.plugins.push(plugin);
      if (plugin.init) plugin.init({ app: this, core: this, view: this.view, buf: this.buf });
      this.registerInputInterceptor(plugin);
    },
    unregisterPlugin(plugin) {
      const idx = this.plugins.indexOf(plugin);
      if (idx !== -1) {
        this.plugins.splice(idx, 1);
        this.unregisterInputInterceptor(plugin);
        plugin.destroy?.();
      }
    },
    getPlugin(name) {
      return this.plugins.find(
        (p) => p.name === name || p.constructor?.name === name
      );
    },
    dispatchScreenUpdate(changedLines) {
      for (const plugin of this.plugins) {
        if (plugin.onScreenUpdate?.(changedLines)) return true;
      }
      return false;
    },
    dispatchFontUpdate(fontInfo) {
      for (const plugin of this.plugins) {
        plugin.onFontUpdate?.(fontInfo);
      }
    },
  };

  const listeners = new Map();
  const mockBuf = {
    addEventListener(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
    },
    removeEventListener(evt, fn) {
      if (!listeners.has(evt)) return;
      const arr = listeners.get(evt);
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    },
  };

  const mockView = {
    useEasyReadingMode: true,
  };

  mockApp.view = mockView;
  mockApp.buf = mockBuf;

  const plugin = new EasyReading();
  assert.equal(plugin.name, 'easy_reading');
  assert.equal(plugin._initialized, false);

  // 1. Register plugin into App
  mockApp.registerPlugin(plugin);
  assert.ok(mockApp.plugins.includes(plugin));
  assert.ok(mockApp.inputInterceptors.includes(plugin));
  assert.equal(mockApp.getPlugin('easy_reading'), plugin);
  assert.equal(plugin._initialized, true);
  assert.equal(mockBuf._easyReading, plugin);
  assert.equal(mockView._easyReading, plugin);
  assert.equal(mockApp.easyReading, plugin);
  assert.equal(listeners.get('change')?.length, 1);
  assert.equal(listeners.get('viewUpdate')?.length, 1);

  // 2. Font update hook
  const dummyOverlay = {
    style: {
      setProperty: (prop, val) => { dummyOverlay.style[prop] = val; },
      fontSize: '',
      lineHeight: '',
    },
  };
  plugin._overlay = dummyOverlay;
  mockApp.dispatchFontUpdate({ fontFace: 'monospace', fontSize: '20px' });
  assert.equal(dummyOverlay.style['--font-face'], 'monospace');
  assert.equal(dummyOverlay.style.fontSize, '20px');
  assert.equal(dummyOverlay.style.lineHeight, '20px');

  // 3. Screen update hook
  let updatePageCalledWith = null;
  plugin.updatePage = (lines) => { updatePageCalledWith = lines; };
  plugin.enabled = true;
  const updateHandled = mockApp.dispatchScreenUpdate(['<div>Line 1</div>']);
  assert.equal(updateHandled, true);
  assert.deepEqual(updatePageCalledWith, ['<div>Line 1</div>']);

  // 4. Unregister and destroy plugin
  mockApp.unregisterPlugin(plugin);
  assert.equal(mockApp.plugins.includes(plugin), false);
  assert.equal(mockApp.inputInterceptors.includes(plugin), false);
  assert.equal(mockApp.getPlugin('easy_reading'), undefined);
  assert.equal(mockApp.easyReading, null);
  assert.equal(mockView._easyReading, null);
  assert.equal(mockBuf._easyReading, null);
  assert.equal(plugin._initialized, false);
  assert.equal(listeners.get('change')?.length, 0);
  assert.equal(listeners.get('viewUpdate')?.length, 0);
});

test('src/plugins exports EasyReading and provides modular plugin architecture', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const easyReadingModule = await import('../src/plugins/easy_reading/index.js');
  const legacyModule = await import('../src/js/easy_reading.js');

  assert.equal(pluginsModule.EasyReading, easyReadingModule.EasyReading);
  assert.equal(pluginsModule.EasyReadingPlugin, easyReadingModule.EasyReadingPlugin);
  assert.equal(legacyModule.EasyReading, easyReadingModule.EasyReading);
  assert.equal(easyReadingModule.default, easyReadingModule.EasyReading);

  assert.equal(easyReadingModule.EasyReading.name, 'easy_reading');
  const instance = new easyReadingModule.EasyReading();
  assert.equal(instance.name, 'easy_reading');
  assert.equal(easyReadingModule.INFLIGHT_WATCHDOG_MS, 1500);
  assert.equal(easyReadingModule.MAX_INFLIGHT_RETRIES, 2);

  // Plugin metadata queries
  const meta = instance.getMetadata();
  assert.equal(meta.id, 'easy_reading');
  assert.equal(meta.name, 'easy_reading');
  assert.equal(meta.prefKey, 'enableEasyReading');
  assert.ok(meta.title && meta.title.length > 0);
  assert.ok(meta.description && meta.description.length > 0);
  assert.equal(meta.icon, 'book');

  // Static metadata queries
  const staticMeta = easyReadingModule.EasyReading.getMetadata();
  assert.equal(staticMeta.id, 'easy_reading');
  assert.equal(staticMeta.prefKey, 'enableEasyReading');

  // getAvailablePlugins discovery
  const available = pluginsModule.getAvailablePlugins();
  assert.ok(Array.isArray(available));
  assert.ok(available.some((p) => p.id === 'easy_reading'));
  assert.ok(available.some((p) => p.id === 'live_update'));

  // getAvailablePlugins queries app.plugins or app.getPluginList
  const mockAppWithPlugins = {
    plugins: [instance],
    getPluginList() {
      return this.plugins.map((p) => p.getMetadata());
    },
  };
  const appList = pluginsModule.getAvailablePlugins(mockAppWithPlugins);
  assert.equal(appList.length, 1);
  assert.equal(appList[0].name, 'easy_reading');
  assert.equal(appList[0].prefKey, 'enableEasyReading');
  assert.equal(appList[0].icon, 'book');
});

test('src/plugins exports LiveUpdate and provides timer and keyboard lifecycle', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const liveUpdateModule = await import('../src/plugins/live_update/index.js');

  assert.equal(pluginsModule.LiveUpdate, liveUpdateModule.LiveUpdate);
  assert.equal(pluginsModule.LiveUpdatePlugin, liveUpdateModule.LiveUpdatePlugin);
  assert.equal(liveUpdateModule.default, liveUpdateModule.LiveUpdate);

  assert.equal(liveUpdateModule.LiveUpdate.name, 'live_update');
  const instance = new liveUpdateModule.LiveUpdate();
  assert.equal(instance.name, 'live_update');

  // Metadata queries
  const meta = instance.getMetadata();
  assert.equal(meta.id, 'live_update');
  assert.equal(meta.name, 'live_update');
  assert.equal(meta.prefKey, 'enableLiveUpdate');
  assert.ok(meta.title && meta.title.length > 0);
  assert.ok(meta.description && meta.description.length > 0);
  assert.equal(meta.icon, 'sync');

  const staticMeta = liveUpdateModule.LiveUpdate.getMetadata();
  assert.equal(staticMeta.id, 'live_update');
  assert.equal(staticMeta.prefKey, 'enableLiveUpdate');

  // Timer & sending logic
  const sentCommands = [];
  const mockApp = {
    buf: { pageState: 3 },
    send(cmd) {
      sentCommands.push(cmd);
    },
  };
  const plugin = new liveUpdateModule.LiveUpdate(mockApp, { enabled: true, intervalSec: 1 });
  plugin.init({ app: mockApp, buf: mockApp.buf });
  plugin.enabled = true;

  assert.equal(plugin.active, false);
  plugin.start();
  assert.equal(plugin.active, true);
  assert.ok(plugin.timer !== null);

  // Interval adjustment
  plugin.setIntervalSec(2);
  assert.equal(plugin.intervalSec, 2);
  assert.equal(plugin.active, true);

  plugin.stop();
  assert.equal(plugin.active, false);
  assert.equal(plugin.timer, null);

  plugin.toggle();
  assert.equal(plugin.active, true);
  plugin.toggle();
  assert.equal(plugin.active, false);

  // Keyboard navigation
  let prevented = false;
  let stoppedPropagation = false;
  const mockEvent = (key, opts = {}) => ({
    key,
    ctrlKey: !!opts.ctrlKey,
    altKey: !!opts.altKey,
    shiftKey: !!opts.shiftKey,
    preventDefault() { prevented = true; },
    stopPropagation() { stoppedPropagation = true; },
  });

  // End key in post mode (pageState 3) with endTurnsOn = true
  prevented = false;
  plugin.endTurnsOn = true;
  const handledEnd = plugin.handleKeyDown(mockEvent('End'));
  assert.equal(handledEnd, true);
  assert.equal(prevented, true);
  assert.equal(plugin.active, true);

  // End key when endTurnsOn = false should not be intercepted
  plugin.endTurnsOn = false;
  prevented = false;
  const ignoredEnd = plugin.handleKeyDown(mockEvent('End'));
  assert.equal(ignoredEnd, false);
  assert.equal(prevented, false);

  // Non-alt key cancels active
  plugin.handleKeyDown(mockEvent('j'));
  assert.equal(plugin.active, false);

  // Alt modifier does not cancel active
  plugin.start();
  plugin.handleKeyDown(mockEvent('Alt', { altKey: true }));
  assert.equal(plugin.active, true);

  // Plugin UI visibility, toolbar controls, and renderOverlay
  assert.equal(typeof plugin.renderOverlay, 'function');
  assert.ok(plugin.renderOverlay() !== null, 'renderOverlay must return element when showsModal is true');
  plugin.setShowToolbar(false);
  assert.equal(plugin.showToolbar, false);
  assert.equal(plugin.showsModal, false);
  assert.equal(plugin.renderOverlay(), null, 'renderOverlay must return null when showsModal is false');
  plugin.setShowToolbar(true);
  assert.equal(plugin.showToolbar, true);
  assert.equal(plugin.showsModal, true);
  assert.ok(plugin.renderOverlay() !== null);

  plugin.setEnabled(false);
  assert.equal(plugin.enabled, false);
  assert.equal(plugin.active, false);
  assert.equal(plugin.showsModal, false);
  assert.equal(plugin.renderOverlay(), null, 'renderOverlay must return null when enabled is false');

  // Clean up
  plugin.destroy();
  assert.equal(plugin.active, false);
  assert.equal(plugin.timer, null);
});

test('ContextMenu and DropdownMenu decouple LiveHelper and remove right-click item', async () => {
  const fs = await import('fs');
  const path = await import('path');

  const dropdownSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/DropdownMenu.js'),
    'utf-8'
  );
  const contextMenuSource = fs.readFileSync(
    path.resolve('src/components/ContextMenu/index.js'),
    'utf-8'
  );
  const prefModalSource = fs.readFileSync(
    fs.existsSync(path.resolve('src/components/Settings/PrefModal.js'))
      ? path.resolve('src/components/Settings/PrefModal.js')
      : path.resolve('src/components/ContextMenu/PrefModal.js'),
    'utf-8'
  );

  // DropdownMenu conditionally renders helper items linked to extensions
  assert.ok(
    dropdownSource.includes('liveHelperEnabled &&') &&
    dropdownSource.includes('cmenu_showLiveArticleHelper'),
    'DropdownMenu must conditionally render cmenu_showLiveArticleHelper when liveHelperEnabled'
  );
  assert.ok(
    dropdownSource.includes('inputHelperEnabled &&') &&
    dropdownSource.includes('cmenu_showInputHelper'),
    'DropdownMenu must conditionally render cmenu_showInputHelper when inputHelperEnabled'
  );

  // ContextMenu no longer imports legacy LiveHelperModal
  assert.ok(
    !contextMenuSource.includes('LiveHelperModal'),
    'ContextMenu must not import or render legacy LiveHelperModal'
  );

  // PrefModal Plugins tab provides sub-options for live_update
  assert.ok(
    prefModalSource.includes('name="endTurnsOnLiveUpdate"'),
    'PrefModal Plugins tab must provide endTurnsOnLiveUpdate checkbox'
  );
  assert.ok(
    prefModalSource.includes('name="liveUpdateInterval"'),
    'PrefModal Plugins tab must provide liveUpdateInterval input'
  );
  assert.ok(
    prefModalSource.includes('name="showLiveUpdateToolbar"'),
    'PrefModal Plugins tab must provide showLiveUpdateToolbar checkbox'
  );
});

test('BaseSite implements setPageState and TermBuf delegates to site.setPageState', () => {
  const site = new BaseSite('test-site');
  const mockTerm = {
    cols: 80,
    rows: 24,
    pageState: 0,
    lines: Array.from({ length: 24 }, () => []),
    getRowText(r) {
      if (r === 23) return '請按任意鍵繼續';
      return '';
    },
    isLineEmpty(r) {
      return r !== 23;
    },
  };

  assert.equal(site.setPageState(mockTerm), 5);
  assert.equal(mockTerm.pageState, 5);

  // When pass screen is cleared to empty row
  mockTerm.getRowText = () => '';
  mockTerm.isLineEmpty = () => true;
  assert.equal(site.setPageState(mockTerm), 0);
  assert.equal(mockTerm.pageState, 0);
});

test('src/plugins exports MouseBrowsing and handles mouse click navigation', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const mouseBrowsingModule = await import('../src/plugins/mouse_browsing/index.js');

  assert.equal(pluginsModule.MouseBrowsing, mouseBrowsingModule.MouseBrowsing);

  const meta = mouseBrowsingModule.MouseBrowsing.getMetadata();
  assert.equal(meta.id, 'mouse_browsing');
  assert.equal(meta.prefKey, 'useMouseBrowsing');

  const sent = [];
  const mockApp = {
    conn: { isConnected: true },
    buf: { mouseCursor: 1, cur_y: 10 },
    site: { getThreadCommand: (cmd) => (cmd === 'prevThread' ? '[' : ']') },
    send: (data) => sent.push(data),
  };

  const mb = new mouseBrowsingModule.MouseBrowsing(mockApp, { enabled: true });
  mb.init({ app: mockApp, buf: mockApp.buf });

  // Arrow Left for cursor 1
  const handled = mb.handleMouseClick({ clientX: 100, clientY: 100 });
  assert.equal(handled, true);
  assert.equal(sent[0], '\x1b[D');

  // Page Up for cursor 2
  mockApp.buf.mouseCursor = 2;
  mb.handleMouseClick({ clientX: 100, clientY: 100 });
  assert.equal(sent[1], '\x1b[5~');

  // Prev thread for cursor 8
  mockApp.buf.mouseCursor = 8;
  mb.handleMouseClick({ clientX: 100, clientY: 100 });
  assert.equal(sent[2], '[');

  // Navigate row and enter
  mb.navigateRowAndEnter(8);
  assert.equal(sent[3], '\x1b[A\x1b[A\r');

  // Decoupled cursor and highlight helpers
  const highlightedRows = [];
  const mockView = {
    setHighlightedRow: (r) => highlightedRows.push(r),
    clearHighlight: () => highlightedRows.push(-1),
  };
  mb.view = mockView;

  mb.setMouseCursor(5);
  assert.equal(mb.mouseCursor, 5);
  assert.equal(mockApp.buf.mouseCursor, 5);

  mb.setHighlight(7);
  assert.equal(mb.nowHighlight, 7);
  assert.equal(mockApp.buf.nowHighlight, 7);
  assert.equal(highlightedRows[highlightedRows.length - 1], 7);

  mb.clearHighlight();
  assert.equal(mb.nowHighlight, -1);
  assert.equal(highlightedRows[highlightedRows.length - 1], -1);

  // Click when cursor is 6 uses nowHighlight
  mb.setMouseCursor(6);
  mb.nowHighlight = 4;
  mb.handleMouseClick({ clientX: 100, clientY: 100 });
  assert.equal(sent[sent.length - 1], '\x1b[A\x1b[A\x1b[A\x1b[A\x1b[A\x1b[A\r');
});

test('src/plugins exports InputHelper and manages modal lifecycle', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const inputHelperModule = await import('../src/plugins/input_helper/index.js');

  assert.equal(pluginsModule.InputHelper, inputHelperModule.InputHelper);

  const meta = inputHelperModule.InputHelper.getMetadata();
  assert.equal(meta.id, 'input_helper');
  assert.equal(meta.prefKey, 'enableInputHelper');

  const ih = new inputHelperModule.InputHelper();
  assert.equal(ih.showsModal, false);
  ih.show();
  assert.equal(ih.showsModal, true);
  ih.hide();
  assert.equal(ih.showsModal, false);
  ih.toggle();
  assert.equal(ih.showsModal, true);
});

test('src/plugins exports AntiIdle and delegates keepalive to site', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const antiIdleModule = await import('../src/plugins/anti_idle/index.js');
  const { PttSite } = await import('../src/js/sites/ptt.js');
  const { BaseSite } = await import('../src/js/sites/base.js');

  assert.equal(pluginsModule.AntiIdle, antiIdleModule.AntiIdle);

  const meta = antiIdleModule.AntiIdle.getMetadata();
  assert.equal(meta.id, 'anti_idle');
  assert.equal(meta.prefKey, 'enableAntiIdle');

  const pttSite = new PttSite();
  const baseSite = new BaseSite();

  const nopCalls = [];
  const sentData = [];
  const mockConn = {
    sendNop: () => nopCalls.push('nop'),
    send: (d) => sentData.push(d),
  };

  const mockApp = {
    connectState: 1,
    site: pttSite,
    conn: mockConn,
    stream: null,
  };

  const antiIdle = new antiIdleModule.AntiIdle(mockApp, {
    enabled: true,
    interval: 2000,
  });

  // Tick 1s: should not trigger yet
  antiIdle.tick(1000);
  assert.equal(nopCalls.length, 0);

  // Tick 1s: reaches 2000ms, should trigger PttSite.sendAntiIdle -> sendNop
  antiIdle.tick(1000);
  assert.equal(nopCalls.length, 1);
  assert.equal(antiIdle.idleTime, 0);

  // Switch to baseSite: should trigger send('\x1b\x1b')
  mockApp.site = baseSite;
  antiIdle.tick(2000);
  assert.deepEqual(sentData, ['\x1b\x1b']);

  // Reset idle suppresses triggering
  antiIdle.tick(1000);
  antiIdle.resetIdle();
  antiIdle.tick(1000);
  assert.equal(sentData.length, 1);
});

test('src/plugins exports AutoWrap and wraps pasted text', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const autoWrapModule = await import('../src/plugins/auto_wrap/index.js');

  assert.equal(pluginsModule.AutoWrap, autoWrapModule.AutoWrap);
  assert.equal(pluginsModule.AutoWrapPlugin, autoWrapModule.AutoWrapPlugin);
  assert.equal(autoWrapModule.default, autoWrapModule.AutoWrap);

  const meta = autoWrapModule.AutoWrap.getMetadata();
  assert.equal(meta.id, 'auto_wrap');
  assert.equal(meta.prefKey, 'enableAutoWrap');
  assert.equal(meta.group, 'bbs');
  assert.equal(typeof meta.renderOptions, 'function');

  // getAvailablePlugins discovery
  const available = pluginsModule.getAvailablePlugins();
  assert.ok(available.some((p) => p.id === 'auto_wrap'));

  const longText = 'This is a very long line of text that should definitely be wrapped across multiple lines when pasted into BBS.';
  const autoWrap = new autoWrapModule.AutoWrap(null, {
    enabled: true,
    lineWrap: 40,
  });

  const wrapped = autoWrap.wrap(longText, '\r');
  assert.ok(wrapped.includes('\r'), 'Long text should contain wrapped newlines');
  for (const line of wrapped.split('\r')) {
    assert.ok(line.length <= 40, `Line "${line}" exceeds wrap limit 40`);
  }

  // When disabled, text is returned as is
  autoWrap.enabled = false;
  assert.equal(autoWrap.wrap(longText, '\r'), longText);

  // transformPaste delegates to wrap
  autoWrap.enabled = true;
  assert.equal(autoWrap.transformPaste(longText, '\r'), wrapped);
});

test('AutoWrap intercepts term:paste event to adjust data before propagating to term', async () => {
  const { AutoWrap } = await import('../src/plugins/auto_wrap/index.js');
  const { Event } = await import('../src/js/event.js');

  class MockApp extends Event {
    constructor() {
      super();
      this.pastedToTerm = null;
      this.view = {
        paste: (text) => {
          this.pastedToTerm = text;
        }
      };
    }

    dispatchPaste(content, originalEvent = null) {
      const detail = {
        data: content,
        text: content,
        originalEvent,
      };
      const event = new CustomEvent('term:paste', {
        detail,
        cancelable: true,
      });
      Object.defineProperty(event, 'data', {
        get() {
          return detail.data;
        },
        set(val) {
          detail.data = val;
          detail.text = val;
        },
        configurable: true,
      });

      this.dispatchEvent(event);
      if (event.defaultPrevented) {
        return false;
      }

      const result = detail.data ?? detail.text;
      if (typeof result !== 'string') {
        return false;
      }

      this.view.paste(result);
      return true;
    }
  }

  const app = new MockApp();
  const autoWrap = new AutoWrap(app, { enabled: true, lineWrap: 30 });

  const longText = 'A quick brown fox jumps over the lazy dog repeatedly until wrapped.';
  app.dispatchPaste(longText);

  assert.ok(app.pastedToTerm, 'Term should have received pasted text');
  assert.notEqual(app.pastedToTerm, longText, 'Pasted text should have been adjusted/wrapped');
  assert.ok(app.pastedToTerm.includes('\r'), 'Adjusted text should contain wrapped newlines');
  for (const line of app.pastedToTerm.split('\r')) {
    assert.ok(line.length <= 30, `Line "${line}" should not exceed 30 chars`);
  }

  // Another plugin can further adjust data in term:paste before term receives it
  const app2 = new MockApp();
  const autoWrap2 = new AutoWrap(app2, { enabled: true, lineWrap: 30 });

  app2.addEventListener('term:paste', (e) => {
    e.data = e.data.toUpperCase();
  });

  app2.dispatchPaste('hello world this is a long text to test chaining');
  assert.ok(app2.pastedToTerm.includes('\r'));
  assert.equal(app2.pastedToTerm, app2.pastedToTerm.toUpperCase(), 'Second plugin should have uppercased data');

  // If a plugin calls preventDefault(), term does not receive the paste
  const app3 = new MockApp();
  const autoWrap3 = new AutoWrap(app3, { enabled: true, lineWrap: 30 });

  app3.addEventListener('term:paste', (e) => {
    e.preventDefault();
  });

  const res = app3.dispatchPaste('some text');
  assert.equal(res, false);
  assert.equal(app3.pastedToTerm, null, 'Term should not receive paste when cancelled');

  // TermView has a standalone paste method and is decoupled from lineWrap
  const fs = await import('node:fs');
  const path = await import('node:path');
  const termViewSrc = fs.readFileSync(path.resolve('src/js/term_view.js'), 'utf-8');
  assert.ok(termViewSrc.includes('paste(text)'), 'TermView must implement paste(text)');
  assert.ok(!termViewSrc.includes('this.lineWrap'), 'TermView must not store lineWrap');
  assert.ok(!termViewSrc.includes('wrapText'), 'TermView must not import or call wrapText');
  assert.ok(!termViewSrc.includes('dispatchTransformPaste'), 'TermView must not call dispatchTransformPaste');

  const appSrc = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(appSrc.includes('dispatchPaste(content'), 'App must implement dispatchPaste');
  assert.ok(appSrc.includes("'term:paste'"), 'App dispatchPaste must dispatch term:paste event');
  assert.ok(!appSrc.includes('this.view.lineWrap ='), 'App must not set this.view.lineWrap');

  autoWrap.destroy();
  autoWrap2.destroy();
  autoWrap3.destroy();
});

test('src/plugins exports MediaPreviewer and resolves trusted image urls', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const mediaModule = await import('../src/plugins/media_previewer/index.js');

  assert.equal(pluginsModule.MediaPreviewer, mediaModule.MediaPreviewer);

  const meta = mediaModule.MediaPreviewer.getMetadata();
  assert.equal(meta.id, 'media_previewer');
  assert.equal(meta.prefKey, 'enablePicPreview');

  const mp = new mediaModule.MediaPreviewer(null, {
    enabled: true,
    whitelistOnly: true,
  });

  // Whitelisted domain (imgur)
  assert.equal(mp.isTrustedDomain('i.imgur.com'), true);
  assert.equal(
    mp.resolveImageUrl('https://imgur.com/abcd123'),
    'https://i.imgur.com/abcd123.jpg'
  );

  // Non-whitelisted domain rejected when whitelistOnly is true
  assert.equal(
    mp.resolveImageUrl('https://untrusted-site.com/image.png', true),
    null
  );

  // Non-whitelisted domain allowed when whitelistOnly is false
  assert.equal(
    mp.resolveImageUrl('https://untrusted-site.com/image.png', false),
    'https://untrusted-site.com/image.png'
  );

  // When plugin is disabled
  mp.enabled = false;
  assert.equal(mp.resolveImageUrl('https://imgur.com/abcd123'), null);
});

test('src/plugins exports ConnectionLog and formats hex data', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const connLogModule = await import('../src/plugins/conn_log/index.js');

  assert.equal(pluginsModule.ConnectionLog, connLogModule.ConnectionLog);

  const meta = connLogModule.ConnectionLog.getMetadata();
  assert.equal(meta.id, 'conn_log');
  assert.equal(meta.prefKey, 'captureConnectionLog');

  // Test bytesToHex formatting
  assert.equal(connLogModule.bytesToHex(new Uint8Array([0x1b, 0x5b, 0x41])), '1B 5B 41');
  assert.equal(connLogModule.bytesToHex([]), '');

  const mockApp = {
    onPrefChange: () => {},
  };
  const cl = new connLogModule.ConnectionLog(mockApp);
  assert.equal(cl.enabled, false);
  cl.init({ app: mockApp });
  assert.equal(mockApp.connLog, cl);
});

test('src/plugins exports FpsMeter and provides plugin metadata and lifecycle', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const fpsModule = await import('../src/plugins/fps_meter/index.js');

  assert.equal(pluginsModule.FpsMeter, fpsModule.FpsMeter);
  assert.equal(pluginsModule.FpsMeterPlugin, fpsModule.FpsMeterPlugin);
  assert.equal(fpsModule.default, fpsModule.FpsMeter);

  const staticMeta = fpsModule.FpsMeter.getMetadata();
  assert.equal(staticMeta.id, 'fps_meter');
  assert.equal(staticMeta.name, 'fps_meter');
  assert.equal(staticMeta.prefKey, 'showFps');
  assert.equal(staticMeta.icon, 'speed');
  assert.ok(staticMeta.title && staticMeta.title.length > 0);
  assert.ok(staticMeta.description && staticMeta.description.length > 0);

  const available = pluginsModule.getAvailablePlugins();
  assert.ok(available.some((p) => p.id === 'fps_meter'));

  const mockApp = {
    onPrefChange: () => {},
  };
  const meter = new fpsModule.FpsMeter(mockApp);
  assert.equal(meter.id, 'fps_meter');
  assert.equal(meter.prefKey, 'showFps');
  assert.equal(meter.icon, 'speed');
  assert.equal(mockApp.fpsMeter, meter);

  const meta = meter.getMetadata();
  assert.equal(meta.id, 'fps_meter');
  assert.equal(meta.prefKey, 'showFps');

  // Core event broadcasts
  const listeners = {};
  const eventApp = {
    addEventListener: (type, fn) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((cb) => cb !== fn);
      }
    },
    dispatchEvent: (ev) => {
      if (listeners[ev.type]) {
        listeners[ev.type].forEach((cb) => cb(ev));
      }
    },
  };

  const eventMeter = new fpsModule.FpsMeter(eventApp);
  assert.equal(eventMeter.enabled, false);

  // Broadcast showFps pref change
  eventApp.dispatchEvent(new CustomEvent('term:pref-change', { detail: { key: 'showFps', value: true } }));
  assert.equal(eventMeter.enabled, true);

  // Broadcast engine and smooth pref changes
  eventApp.dispatchEvent(new CustomEvent('term:pref-change', { detail: { key: 'useCanvasEngine', value: true } }));
  assert.equal(eventMeter.isCanvas, true);
  eventApp.dispatchEvent(new CustomEvent('term:pref-change', { detail: { key: 'smoothAnsiArt', value: false } }));
  assert.equal(eventMeter.smoothAnsiArt, false);

  // Broadcast term:render-frame
  let recordFrameCalled = false;
  const originalRecord = eventMeter.recordFrame.bind(eventMeter);
  eventMeter.recordFrame = (duration, isCanvas) => {
    recordFrameCalled = true;
    originalRecord(duration, isCanvas);
  };
  eventApp.dispatchEvent(new CustomEvent('term:render-frame', { detail: { durationMs: 16.6, isCanvas: true } }));
  assert.equal(recordFrameCalled, true);

  eventMeter.destroy();
  assert.equal(eventMeter.enabled, false);
});

test('src/plugins exports TouchDebugHUD and provides plugin metadata and lifecycle', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const hudModule = await import('../src/plugins/touch_debug_hud/index.js');

  assert.equal(pluginsModule.TouchDebugHUD, hudModule.TouchDebugHUD);
  assert.equal(pluginsModule.TouchDebugHUDPlugin, hudModule.TouchDebugHUDPlugin);
  assert.equal(hudModule.default, hudModule.TouchDebugHUDPlugin);

  const staticMeta = hudModule.TouchDebugHUDPlugin.getMetadata();
  assert.equal(staticMeta.id, 'touch_debug_hud');
  assert.equal(staticMeta.name, 'touch_debug_hud');
  assert.equal(staticMeta.prefKey, 'enableTouchDebugHUD');
  assert.equal(staticMeta.icon, 'debug');
  assert.ok(staticMeta.title && staticMeta.title.length > 0);
  assert.ok(staticMeta.description && staticMeta.description.length > 0);

  const available = pluginsModule.getAvailablePlugins();
  assert.ok(available.some((p) => p.id === 'touch_debug_hud'));

  const mockApp = {
    onPrefChange: () => {},
  };
  const hudPlugin = new hudModule.TouchDebugHUDPlugin(mockApp);
  hudPlugin.init({ app: mockApp });
  assert.equal(mockApp.touchDebugHUD, hudPlugin);
  assert.equal(hudPlugin.id, 'touch_debug_hud');
  assert.equal(hudPlugin.prefKey, 'enableTouchDebugHUD');
  assert.equal(hudPlugin.icon, 'debug');

  assert.equal(typeof hudPlugin.renderOverlay, 'function');
  const overlayNode = hudPlugin.renderOverlay({ app: mockApp });
  assert.ok(overlayNode);
  hudPlugin.setEnabled(true);
  assert.equal(hudPlugin.enabled, true);
  hudPlugin.setEnabled(false);
  assert.equal(hudPlugin.enabled, false);
  hudPlugin.destroy();
});

test('MediaPreviewer exposes getHyperlinkPreviewHook for screen integration', async () => {
  const { MediaPreviewer } = await import('../src/plugins/media_previewer/index.js');
  const previewer = new MediaPreviewer();
  previewer.enabled = true;
  previewer.whitelistOnly = true;

  const hook = previewer.getHyperlinkPreviewHook();
  assert.ok(hook && typeof hook.createPreviewRequest === 'function');

  // Whitelisted domain returns resolved URL
  const valid = hook.createPreviewRequest('https://imgur.com/abc1234');
  assert.equal(valid, 'https://i.imgur.com/abc1234.jpg');

  // Non-whitelisted domain returns null when whitelistOnly is true
  const untrusted = hook.createPreviewRequest('https://untrusted.org/pic.png');
  assert.equal(untrusted, null);

  // When disabled, returns null
  previewer.enabled = false;
  assert.equal(hook.createPreviewRequest('https://imgur.com/abc1234'), null);
});

test('BaseSite and PttSite checkLoginPrompt matches 請輸入代號 across Taiwan BBSes', async () => {
  const { u2b } = await import('../src/js/string_util.js');
  const baseSite = new BaseSite();
  const pttSite = new PttSite();

  // 1. Generic login prompt in BaseSite
  assert.equal(baseSite.checkLoginPrompt('請輸入代號，或以 guest 參觀，或以 new 註冊: '), true);
  assert.equal(baseSite.checkLoginPrompt('請輸入代號，或以 guest 參觀: '), true);
  assert.equal(baseSite.checkLoginPrompt('請輸入代號: '), true);
  assert.equal(baseSite.checkLoginPrompt('請輸入代號'), true);

  // 2. Inherited by PttSite
  assert.equal(pttSite.checkLoginPrompt('請輸入代號，或以 guest 參觀，或以 new 註冊: '), true);
  assert.equal(pttSite.checkLoginPrompt('請輸入代號'), true);

  // 3. Big5 binary decoding in onData
  const pttBig5 = Uint8Array.from(u2b('請輸入代號，或以 guest 參觀，或以 new 註冊: '), c => c.charCodeAt(0));
  let loginFired = false;
  const mockBuf = {
    app: {
      dispatchEvent(e) {
        if (e.type === 'login') loginFired = true;
      },
    },
    dispatchEvent() {},
  };
  pttSite.onData(pttBig5, mockBuf);
  assert.equal(loginFired, true);

  // Guarded so it only fires once per session
  loginFired = false;
  pttSite.onData(pttBig5, mockBuf);
  assert.equal(loginFired, false);

  // Reset allows firing again on next session
  pttSite.resetLoginPrompt();
  pttSite.onData(pttBig5, mockBuf);
  assert.equal(loginFired, true);

  // 4. Fallback to termBuf inspection when raw text is empty
  const termBufPrompt = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 21 ? '請輸入代號，或以 guest 參觀，或以 new 註冊: ' : ''),
  };
  assert.equal(baseSite.checkLoginPrompt('', termBufPrompt), true);
  assert.equal(pttSite.checkLoginPrompt('', termBufPrompt), true);

  // 5. Returns false if already in article list or reading screen
  const readingTermBuf = {
    rows: 24,
    cols: 80,
    getRowText: (r) => (r === 23 ? '  瀏覽 第 1/1 頁 (100%)  目前顯示: 第 01~20 行 (y)回應 (←)離開 ' : ''),
  };
  assert.equal(pttSite.checkLoginPrompt('請輸入代號', readingTermBuf), false);
  assert.equal(baseSite.checkLoginPrompt('請輸入代號', readingTermBuf), false);
});

test('Maple3Site checkLoginPrompt matches maplebbs-itoc strings', async () => {
  const { u2b } = await import('../src/js/string_util.js');
  const site = new Maple3Site();

  // 1. Strings from maplebbs-itoc bbsd.c:604 and global.h:391
  assert.equal(site.checkLoginPrompt('   [您的帳號] '), true);
  assert.equal(site.checkLoginPrompt('請輸入代號：'), true);
  assert.equal(site.checkLoginPrompt('請輸入代號'), true);
  assert.equal(site.checkLoginPrompt('other screen'), false);

  // 2. Big5 binary decoding in onData
  const mapleBig5 = Uint8Array.from(u2b('   [您的帳號] '), c => c.charCodeAt(0));
  let loginFired = false;
  const mockBuf = {
    app: {
      dispatchEvent(e) {
        if (e.type === 'login') loginFired = true;
      },
    },
    dispatchEvent() {},
  };
  site.onData(mapleBig5, mockBuf);
  assert.equal(loginFired, true);
});

test('AutoSite onData fires login on 請輸入代號 without locking to PTT, and locks to maple3 on [您的帳號]', async () => {
  const { u2b } = await import('../src/js/string_util.js');

  // Case 1: Maple login prompt [您的帳號] locks AutoSite to maple3 and fires login
  const auto1 = new AutoSite();
  let fired1 = false;
  const mockBuf1 = {
    rows: 24,
    cols: 80,
    app: {
      dispatchEvent(e) {
        if (e.type === 'login') fired1 = true;
      },
    },
    dispatchEvent() {},
  };
  const mapleChunk = Uint8Array.from(u2b('   [您的帳號] '), c => c.charCodeAt(0));
  auto1.onData(mapleChunk, mockBuf1);
  assert.equal(auto1.name, 'maple3');
  assert.equal(auto1.isLocked, true);
  assert.equal(fired1, true);

  // Case 2: Generic BBS login prompt 請輸入代號 triggers login, but does NOT lock to PTT
  const auto2 = new AutoSite();
  let fired2 = false;
  const mockBuf2 = {
    rows: 24,
    cols: 80,
    app: {
      dispatchEvent(e) {
        if (e.type === 'login') fired2 = true;
      },
    },
    dispatchEvent() {},
  };
  const pttChunk = Uint8Array.from(u2b('請輸入代號，或以 guest 參觀: '), c => c.charCodeAt(0));
  auto2.onData(pttChunk, mockBuf2);
  assert.equal(fired2, true, '請輸入代號 must fire login event');
  assert.equal(auto2.isLocked, false, '請輸入代號 must NOT lock AutoSite to PTT');
});
