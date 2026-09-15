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
  PAGE_STATE,
} from '../src/js/sites/index.js';
import { EventEmitter } from '../src/js/event.js';
import { InputInterceptors } from '../src/js/input_interceptors.js';
import {
  EasyReading,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
} from '../src/plugins/easy_reading/index.js';
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

test('PttSite parses reading status row including 1000+ page live threads and variations (Issue #38)', () => {
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

  // 1000+ page C_Chat Hololive live thread with shortened footer
  const status1000End = '  瀏覽 第 1024/1024 頁 (100%)  目前顯示: 第 22500~22536 行 (h)說明 (←/q)離開 ';
  const parsed1000End = parseStatusRow(status1000End);
  assert.ok(parsed1000End);
  assert.equal(parsed1000End.pageIndex, 1024);
  assert.equal(parsed1000End.pageTotal, 1024);
  assert.equal(parsed1000End.pagePercent, 100);
  assert.equal(parsed1000End.rowIndexStart, 22500);
  assert.equal(parsed1000End.rowIndexEnd, 22536);
  assert.equal(parsed1000End.isEnd, true);

  // Page 1 of a 1250-page live thread
  const status1000Start = '  瀏覽 第 1/1250 頁 (  0%)  目前顯示: 第 01~37 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
  const parsed1000Start = parseStatusRow(status1000Start);
  assert.ok(parsed1000Start);
  assert.equal(parsed1000Start.pageIndex, 1);
  assert.equal(parsed1000Start.pageTotal, 1250);
  assert.equal(parsed1000Start.isEnd, false);

  // Horizontal shifted view (顯示範圍)
  const statusShifted = '  瀏覽 第 50/100 頁 ( 50%)  顯示範圍: 第 1100~1122 行, 第 02~81 字 (←)離開 ';
  const parsedShifted = parseStatusRow(statusShifted);
  assert.ok(parsedShifted);
  assert.equal(parsedShifted.pageIndex, 50);
  assert.equal(parsedShifted.pageTotal, 100);
  assert.equal(parsedShifted.rowIndexStart, 1100);
  assert.equal(parsedShifted.rowIndexEnd, 1122);

  // Old status bar mode
  const statusOld = '瀏覽 P.1024(100%)  (y)回應(X)推文(h)說明(←)離開 ';
  const parsedOld = parseStatusRow(statusOld);
  assert.ok(parsedOld);
  assert.equal(parsedOld.pageIndex, 1024);
  assert.equal(parsedOld.pagePercent, 100);
  assert.equal(parsedOld.isEnd, true);

  assert.equal(parseStatusRow('這是普通內文不是狀態列'), null);

  // AutoSite forwards pageState and prevPageState properly
  const autoSite = new AutoSite();
  const mockTerm38 = {
    rows: 38,
    cols: 80,
    isLineEmpty: (r) => false,
    getRowText: (r) => (r === 37 ? status1000End : '推 hololive: 實況推文'),
  };
  autoSite.setPageState(mockTerm38);
  assert.equal(autoSite.pageState, PAGE_STATE.READING, 'AutoSite proxy must reflect active site pageState');
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

    class MockTarget extends EventEmitter {}

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
      send: (cmd) => sentCommands.push(cmd),
      site: ptt,
    };

    const mockView = {
      conn: {
        send: (cmd) => sentCommands.push(cmd),
      },
      hideEasyReading: () => {},
    };

    ptt.pageState = PAGE_STATE.READING;
    ptt.prevPageState = PAGE_STATE.NORMAL;

    const mockTermBuf = Object.assign(new MockTarget(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
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

    const easyReading = new EasyReading(mockCore, { view: mockView, buf: mockTermBuf, enabled: true });
    easyReading.init({ app: mockCore, view: mockView, buf: mockTermBuf, enabled: true });
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
    ptt.prevPageState = 3;

    // 2. While in-flight, duplicate updates for same page must NOT trigger another PageDown
    mockTermBuf.dispatchEvent({ type: 'change' });
    assert.equal(easyReading.sendCommandAfterUpdate, '');
    assert.equal(easyReading._pageDownInFlight, true);

    // 3. Server delivers page 2 -> advances page, clears in-flight, queues next PageDown
    ptt.prevPageState = 3;
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

    class MockTarget extends EventEmitter {}

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
      send: (cmd) => sentCommands.push(cmd),
      site: ptt,
    };

    const mockView = {
      conn: {
        send: (cmd) => sentCommands.push(cmd),
      },
      hideEasyReading: () => {},
    };

    ptt.pageState = PAGE_STATE.READING;
    ptt.prevPageState = PAGE_STATE.NORMAL;

    const mockTermBuf = Object.assign(new MockTarget(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
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

    const easyReading = new EasyReading(mockCore, { view: mockView, buf: mockTermBuf, enabled: true });
    easyReading.init({ app: mockCore, view: mockView, buf: mockTermBuf, enabled: true });

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

    class MockTarget extends EventEmitter {}

    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
      send: (cmd) => sentCommands.push(cmd),
      site: ptt,
    };

    const mockView = {
      conn: {
        send: (cmd) => sentCommands.push(cmd),
      },
      hideEasyReading: () => {},
    };

    ptt.pageState = PAGE_STATE.READING;
    ptt.prevPageState = PAGE_STATE.NORMAL;

    // Note: cursor parked at column 15 instead of legacy 79
    const mockTermBuf = Object.assign(new MockTarget(), {
      cols: 80,
      rows: 24,
      cur_x: 15,
      cur_y: 23,
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

    const easyReading = new EasyReading(mockCore, { view: mockView, buf: mockTermBuf, enabled: true });
    easyReading.init({ app: mockCore, view: mockView, buf: mockTermBuf, enabled: true });

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

    const ptt = new PttSite();
    const mockCore = {
      connectedUrl: { easyReadingSupported: true },
      suppressInertialWheel: () => {},
      site: ptt,
    };
    const renderedRows = [];
    const mockView = {
      termWin: container,
      chh: 16,
      renderRow: (line, row, chh, preview, el) => {
        renderedRows.push({ line, row });
      },
    };
    const mockTermBuf = {
      cols: 80,
      rows: 24,
      addEventListener: () => {},
      site: ptt,
    };

    const easyReading = new EasyReading(mockCore, { view: mockView, buf: mockTermBuf, enabled: true });
    easyReading.init({ app: mockCore, view: mockView, buf: mockTermBuf, enabled: true });
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
    site: new PttSite(),
  };
  const mockView = {
    chh: 16,
  };
  const mockTermBuf = {
    cols: 80,
    rows: 24,
    addEventListener: () => {},
  };

  const easyReading = new EasyReading(mockCore, { view: mockView, buf: mockTermBuf, enabled: true });
  easyReading.init({ app: mockCore, view: mockView, buf: mockTermBuf, enabled: true });

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
    site: {
      getThreadCommand: (type) => (type === 'prevThread' ? '\x1b[D\x1b[A\x1b[C' : '\x1b[D\x1b[B\x1b[C'),
    },
    send: (data) => sent.push(data),
  };
  mockCore.inputInterceptors = new InputInterceptors(mockCore);
  mockCore.registerInputInterceptor = (it) => mockCore.inputInterceptors.registerInterceptor(it);
  mockCore.unregisterInputInterceptor = (it) => mockCore.inputInterceptors.unregisterInterceptor(it);
  mockCore.hasActiveInputInterceptor = () => mockCore.inputInterceptors.hasActive();

  const mockTermBuf = {
    site: mockCore.site,
    addEventListener: () => {},
  };
  const mockView = {
    chh: 16,
    conn: { send: (d) => sent.push(d) },
  };

  const easyReading = new EasyReading(mockCore, { view: mockView, buf: mockTermBuf, enabled: true });
  easyReading.init({ app: mockCore, view: mockView, buf: mockTermBuf });

  // Not active initially
  assert.equal(easyReading.isActive(), false);
  assert.equal(mockCore.hasActiveInputInterceptor(), false);
  assert.equal(mockCore.inputInterceptors.dispatchNavCmd('doArrowDown'), false);
  assert.equal(mockCore.inputInterceptors.dispatchWheel({ deltaY: 50 }), false);

  // Activate easy reading
  easyReading._overlay = { style: { display: 'block' } };
  easyReading._content = { scrollTop: 0, scrollHeight: 500, clientHeight: 200 };
  easyReading.enabled = true;
  easyReading.started = true;
  assert.equal(easyReading.isActive(), true);
  assert.equal(mockCore.hasActiveInputInterceptor(), true);

  // Wheel handling when active: returns true and updates lastWheelTime
  const wheelRes = mockCore.inputInterceptors.dispatchWheel({ deltaY: 50 });
  assert.equal(wheelRes, true);
  assert.ok(easyReading.lastWheelTime > 0);

  // Navigation commands when active
  // doArrowDown: scrollable, scrolls by 1 line (16px) and returns true without sending terminal keys
  const navDown = mockCore.inputInterceptors.dispatchNavCmd('doArrowDown');
  assert.equal(navDown, true);
  assert.equal(easyReading._content.scrollTop, 16);
  assert.equal(sent.length, 0);

  // doArrowUp: scrollable (scrollTop=16), scrolls up by 1 line to 0
  const navUp = mockCore.inputInterceptors.dispatchNavCmd('doArrowUp');
  assert.equal(navUp, true);
  assert.equal(easyReading._content.scrollTop, 0);
  assert.equal(sent.length, 0);

  // doArrowUp again at scrollTop=0: cannot scroll further, leaves current post and sends escape sequence
  const navUpBoundary = mockCore.inputInterceptors.dispatchNavCmd('doArrowUp');
  assert.equal(navUpBoundary, true);
  assert.deepEqual(sent, ['\x1b[D\x1b[A\x1b[C']);
  sent.length = 0;

  // previousThread / nextThread
  mockCore.inputInterceptors.dispatchNavCmd('nextThread');
  assert.deepEqual(sent, ['\x1b[D\x1b[B\x1b[C']);
  sent.length = 0;

  // KeyDown and text input handling (Chinese IME composition suppression)
  const keyDownEvent = { keyCode: 229, isComposing: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  mockCore.inputInterceptors.dispatchKeyDown(keyDownEvent);
  assert.equal(easyReading._keyDownKeyCode, 229);
  assert.equal(easyReading._keyDownIsComposing, true);

  const textInputEvent = { target: { value: '注' } };
  const inputHandled = mockCore.inputInterceptors.dispatchTextInput(textInputEvent);
  assert.equal(inputHandled, true);
  assert.equal(textInputEvent.target.value, ''); // Swallowed composition string!

  // Selection col/row is null during easy reading (grid coordinates suppressed)
  assert.equal(mockCore.inputInterceptors.getSelectionColRow(), null);

  // Wheel suppression upon exit: disabled by default when mouseWheelTrackpadMode is false
  easyReading.hide();
  assert.equal(easyReading.isActive(), false);
  const defaultWheel = mockCore.inputInterceptors.dispatchWheel({ deltaY: 50 });
  assert.equal(defaultWheel, false);

  // When mouseWheelTrackpadMode is enabled, post-exit inertial trackpad wheel is suppressed
  mockCore.mouseWheelTrackpadMode = true;
  easyReading.started = true;
  easyReading._overlay.style.display = 'block';
  mockCore.inputInterceptors.dispatchWheel({ deltaY: 50 });
  easyReading.hide();
  const suppressedWheel = mockCore.inputInterceptors.dispatchWheel({ deltaY: 50 });
  assert.equal(suppressedWheel, 'suppress');

  // Unregister interceptor
  easyReading.destroy();
  assert.equal(mockCore.inputInterceptors.listenerCount('navCmd'), 0);
});

test('EasyReading plugin lifecycle: registerPlugin, events, and destroy', () => {
  const mockApp = Object.assign(new EventEmitter(), {
    plugins: [],
    registerPlugin(plugin) {
      if (!plugin || this.plugins.includes(plugin)) return;
      this.plugins.push(plugin);
      if (plugin.init) plugin.init({ app: this, view: this.view, buf: this.buf });
    },
    getPlugin(name) {
      return this.plugins.find(
        (p) => p.name === name || p.constructor?.name === name
      );
    },
  });
  mockApp.inputInterceptors = new InputInterceptors(mockApp);
  mockApp.registerInputInterceptor = (it) => mockApp.inputInterceptors.registerInterceptor(it);
  mockApp.unregisterInputInterceptor = (it) => mockApp.inputInterceptors.unregisterInterceptor(it);

  const listeners = new Map();
  const mockBuf = {
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
    },
    off(evt, fn) {
      if (!listeners.has(evt)) return;
      const arr = listeners.get(evt);
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    },
    addEventListener(evt, fn) {
      this.on(evt, fn);
    },
    removeEventListener(evt, fn) {
      this.off(evt, fn);
    },
  };

  const mockView = {};
  mockApp.prefValues = { enableEasyReading: true };
  mockApp.view = mockView;
  mockApp.buf = mockBuf;
  mockApp.site = new PttSite();

  const plugin = new EasyReading();
  assert.equal(plugin.name, 'easy_reading');
  assert.equal(plugin._initialized, false);

  // 1. Register plugin into App
  mockApp.registerPlugin(plugin);
  assert.ok(mockApp.plugins.includes(plugin));
  assert.ok(mockApp.inputInterceptors.listenerCount('navCmd') > 0);
  assert.equal(mockApp.getPlugin('easy_reading'), plugin);
  assert.equal(plugin._initialized, true);
  assert.equal(mockBuf._easyReading, undefined);
  assert.equal(mockView._easyReading, undefined);
  assert.equal(mockApp.easyReading, undefined);
  assert.equal(listeners.get('change')?.length, 1);
  assert.equal(listeners.get('viewUpdate')?.length, 1);

  // 2. Font update via event bus
  const dummyOverlay = {
    style: {
      setProperty: (prop, val) => { dummyOverlay.style[prop] = val; },
      fontSize: '',
      lineHeight: '',
    },
  };
  plugin._overlay = dummyOverlay;
  mockApp.emit('term:font-update', { fontFace: 'monospace', fontSize: '20px' });
  assert.equal(dummyOverlay.style['--font-face'], 'monospace');
  assert.equal(dummyOverlay.style.fontSize, '20px');
  assert.equal(dummyOverlay.style.lineHeight, '20px');

  // 3. Screen update via event bus
  let updatePageCalledWith = null;
  plugin.updatePage = (lines) => { updatePageCalledWith = lines; };
  mockApp.emit('term:screen-update', { changedLineHtmlStrs: ['<div>Line 1</div>'] });
  assert.deepEqual(updatePageCalledWith, ['<div>Line 1</div>']);

  // 4. Destroy plugin
  plugin.destroy();
  assert.equal(mockApp.inputInterceptors.listenerCount('navCmd'), 0);
  assert.equal(mockApp.easyReading, undefined);
  assert.equal(mockView._easyReading, undefined);
  assert.equal(mockBuf._easyReading, undefined);
  assert.equal(plugin._initialized, false);
  assert.equal(listeners.get('change')?.length, 0);
  assert.equal(listeners.get('viewUpdate')?.length, 0);
});

test('src/plugins exports EasyReading and provides modular plugin architecture', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const easyReadingModule = await import('../src/plugins/easy_reading/index.js');

  assert.equal(pluginsModule.EasyReading, easyReadingModule.EasyReading);
  assert.equal(pluginsModule.EasyReadingPlugin, easyReadingModule.EasyReadingPlugin);
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
  const mockApp = new EventEmitter();
  mockApp.site = { pageState: PAGE_STATE.READING };
  mockApp.buf = { site: mockApp.site };
  mockApp.send = (cmd) => {
    sentCommands.push(cmd);
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
    path.resolve('src/components/Settings/PrefModal.js'),
    'utf-8'
  );

  // DropdownMenu dynamically renders helper items linked to extensions
  assert.ok(
    dropdownSource.includes('pluginItems &&') &&
    dropdownSource.includes('pluginItems.map'),
    'DropdownMenu must dynamically render pluginItems without hardcoded helper fallbacks'
  );
  assert.ok(
    !dropdownSource.includes('liveHelperEnabled'),
    'DropdownMenu must not contain hardcoded liveHelperEnabled fallback'
  );

  // ContextMenu no longer imports legacy LiveHelperModal
  assert.ok(
    !contextMenuSource.includes('LiveHelperModal'),
    'ContextMenu must not import or render legacy LiveHelperModal'
  );

  // LiveUpdate plugin provides sub-options rendered via renderOptions
  const liveUpdateSource = fs.readFileSync(
    path.resolve('src/plugins/live_update/LiveUpdate.js'),
    'utf-8'
  );
  assert.ok(
    liveUpdateSource.includes('name: "endTurnsOnLiveUpdate"') ||
    liveUpdateSource.includes('name="endTurnsOnLiveUpdate"'),
    'LiveUpdate plugin provides endTurnsOnLiveUpdate checkbox'
  );
  assert.ok(
    liveUpdateSource.includes('name: "liveUpdateInterval"') ||
    liveUpdateSource.includes('name="liveUpdateInterval"'),
    'LiveUpdate plugin provides liveUpdateInterval input'
  );
  assert.ok(
    liveUpdateSource.includes('name: "showLiveUpdateToolbar"') ||
    liveUpdateSource.includes('name="showLiveUpdateToolbar"'),
    'LiveUpdate plugin provides showLiveUpdateToolbar checkbox'
  );
});

test('PAGE_STATE enum provides named constants for terminal screen states', () => {
  assert.equal(PAGE_STATE.NORMAL, 0);
  assert.equal(PAGE_STATE.MENU, 1);
  assert.equal(PAGE_STATE.LIST, 2);
  assert.equal(PAGE_STATE.READING, 3);
  assert.equal(PAGE_STATE.MAPLE_LIST, 4);
  assert.equal(PAGE_STATE.PASS, 5);
  assert.equal(PAGE_STATE.EDITING, 6);
  assert.equal(BaseSite.PAGE_STATE, PAGE_STATE);
});

test('BaseSite manages pageState and TermBuf does not own pageState', async () => {
  const site = new BaseSite('test-site');
  const mockTerm = {
    cols: 80,
    rows: 24,
    lines: Array.from({ length: 24 }, () => []),
    getRowText(r) {
      if (r === 23) return '請按任意鍵繼續';
      return '';
    },
    isLineEmpty(r) {
      return r !== 23;
    },
  };

  assert.equal(site.setPageState(mockTerm), PAGE_STATE.PASS);
  assert.equal(site.pageState, PAGE_STATE.PASS);

  // When pass screen is cleared to empty row
  mockTerm.getRowText = () => '';
  mockTerm.isLineEmpty = () => true;
  assert.equal(site.setPageState(mockTerm), PAGE_STATE.NORMAL);
  assert.equal(site.pageState, PAGE_STATE.NORMAL);

  // TermBuf does not declare pageState API; callers query site directly
  const fs = await import('fs');
  const path = await import('path');
  const termBufSource = fs.readFileSync(
    path.resolve('src/js/term_buf.js'),
    'utf-8'
  );
  assert.ok(
    !termBufSource.includes('get pageState()'),
    'TermBuf must not define pageState getter'
  );
  assert.ok(
    !termBufSource.includes('set pageState('),
    'TermBuf must not define pageState setter'
  );
  assert.ok(
    !termBufSource.includes('get prevPageState()'),
    'TermBuf must not define prevPageState getter'
  );
  assert.ok(
    !termBufSource.includes('set prevPageState('),
    'TermBuf must not define prevPageState setter'
  );
  assert.ok(
    !termBufSource.includes('mouseCursor'),
    'TermBuf must not define mouseCursor property or getter/setter'
  );
});

test('src/plugins exports MouseBrowsing and handles mouse click navigation', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const mouseBrowsingModule = await import('../src/plugins/mouse_browsing/index.js');

  assert.equal(pluginsModule.MouseBrowsing, mouseBrowsingModule.MouseBrowsing);

  const meta = mouseBrowsingModule.MouseBrowsing.getMetadata();
  assert.equal(meta.id, 'mouse_browsing');
  assert.equal(meta.prefKey, 'enableMouseBrowsing');

  const sent = [];
  const mockApp = {
    conn: { isConnected: true },
    buf: { cur_y: 10 },
    site: { getThreadCommand: (cmd) => (cmd === 'prevThread' ? '[' : ']') },
    send: (data) => sent.push(data),
    on: () => {},
    off: () => {},
  };

  const mb = new mouseBrowsingModule.MouseBrowsing(mockApp, { enabled: true });
  mb.init({ app: mockApp, buf: mockApp.buf });

  // Arrow Left for cursor 1
  mb.mouseCursor = 1;
  const handled = mb.handleMouseClick({ clientX: 100, clientY: 100 });
  assert.equal(handled, true);
  assert.equal(sent[0], '\x1b[D');

  // Page Up for cursor 2
  mb.mouseCursor = 2;
  mb.handleMouseClick({ clientX: 100, clientY: 100 });
  assert.equal(sent[1], '\x1b[5~');

  // Prev thread for cursor 8
  mb.mouseCursor = 8;
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

  mb.setHighlight(7);
  assert.equal(mb.nowHighlight, 7);
  assert.equal(highlightedRows[highlightedRows.length - 1], 7);

  // When highlightCursor is false, visual highlight on view is -1 while logical nowHighlight is preserved
  mb.highlightCursor = false;
  mb.setHighlight(9);
  assert.equal(mb.nowHighlight, 9);
  assert.equal(highlightedRows[highlightedRows.length - 1], -1);
  mb.highlightCursor = true;

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

  const mockApp = new EventEmitter();
  mockApp.connectState = 1;
  mockApp.site = pttSite;
  mockApp.conn = mockConn;
  mockApp.stream = null;
  mockApp.sendAntiIdle = () => {
    if (mockApp.site?.sendAntiIdle) {
      mockApp.site.sendAntiIdle(mockApp.conn, mockApp.stream);
    }
  };
  mockApp.on('term:anti-idle', () => mockApp.sendAntiIdle());

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

  // Verify App sendAntiIdle and term:anti-idle event dispatching
  let appAntiIdleSent = false;
  const eventApp = new EventEmitter();
  eventApp.connectState = 1;
  eventApp.site = {
    sendAntiIdle: () => { appAntiIdleSent = true; },
  };
  eventApp.conn = {};
  eventApp.stream = null;
  eventApp.events = [];
  eventApp.on('term:anti-idle', () => {
    eventApp.events.push('term:anti-idle');
    eventApp.site.sendAntiIdle(eventApp.conn);
  });
  const eventAntiIdle = new antiIdleModule.AntiIdle(eventApp, {
    enabled: true,
    interval: 1000,
  });
  eventAntiIdle.tick(1000);
  assert.ok(eventApp.events.includes('term:anti-idle'));
  assert.equal(appAntiIdleSent, true);
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
  const { EventEmitter } = await import('../src/js/event.js');

  class MockApp extends EventEmitter {
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
  autoWrap.init({ app, enabled: true, lineWrap: 30 });

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
  autoWrap2.init({ app: app2, enabled: true, lineWrap: 30 });

  app2.addEventListener('term:paste', (e) => {
    e.data = e.data.toUpperCase();
  });

  app2.dispatchPaste('hello world this is a long text to test chaining');
  assert.ok(app2.pastedToTerm.includes('\r'));
  assert.equal(app2.pastedToTerm, app2.pastedToTerm.toUpperCase(), 'Second plugin should have uppercased data');

  // If a plugin calls preventDefault(), term does not receive the paste
  const app3 = new MockApp();
  const autoWrap3 = new AutoWrap(app3, { enabled: true, lineWrap: 30 });
  autoWrap3.init({ app: app3, enabled: true, lineWrap: 30 });

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
  assert.equal(meta.prefKey, 'enableMediaPreviewer');

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

test('src/plugins exports PacketDump and formats hex data', async () => {
  const pluginsModule = await import('../src/plugins/index.js');
  const packetDumpModule = await import('../src/plugins/packet_dump/index.js');

  assert.equal(pluginsModule.PacketDump, packetDumpModule.PacketDump);

  const meta = packetDumpModule.PacketDump.getMetadata();
  assert.equal(meta.id, 'packet_dump');
  assert.equal(meta.prefKey, 'enablePacketDump');

  // Test bytesToHex formatting
  assert.equal(packetDumpModule.bytesToHex(new Uint8Array([0x1b, 0x5b, 0x41])), '1B 5B 41');
  assert.equal(packetDumpModule.bytesToHex([]), '');

  const mockApp = {
    onPrefChange: () => {},
  };
  const pd = new packetDumpModule.PacketDump(mockApp);
  assert.equal(pd.enabled, false);
  pd.init({ app: mockApp });
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
  assert.equal(staticMeta.prefKey, 'enableFpsMeter');
  assert.equal(staticMeta.icon, 'speed');
  assert.ok(staticMeta.title && staticMeta.title.length > 0);
  assert.ok(staticMeta.description && staticMeta.description.length > 0);

  const available = pluginsModule.getAvailablePlugins();
  assert.ok(available.some((p) => p.id === 'fps_meter'));

  const mockApp = {
    onPrefChange: () => {},
    on: () => {},
    off: () => {},
  };
  const meter = new fpsModule.FpsMeter(mockApp);
  assert.equal(meter.id, 'fps_meter');
  assert.equal(meter.prefKey, 'enableFpsMeter');
  assert.equal(meter.icon, 'speed');

  const meta = meter.getMetadata();
  assert.equal(meta.id, 'fps_meter');
  assert.equal(meta.prefKey, 'enableFpsMeter');

  // Core event broadcasts
  const eventApp = new EventEmitter();
  const eventMeter = new fpsModule.FpsMeter(eventApp);
  eventMeter.init({ app: eventApp });
  assert.equal(eventMeter.enabled, false);

  // Broadcast enableFpsMeter pref change
  eventApp.emit('term:pref-change', { key: 'enableFpsMeter', value: true });
  assert.equal(eventMeter.enabled, true);

  // Broadcast engine and smooth pref changes
  eventApp.emit('term:pref-change', { key: 'useCanvasEngine', value: true });
  assert.equal(eventMeter.isCanvas, true);
  eventApp.emit('term:pref-change', { key: 'smoothAnsiArt', value: false });
  assert.equal(eventMeter.smoothAnsiArt, false);

  // Broadcast term:render-frame
  let recordFrameCalled = false;
  const originalRecord = eventMeter.recordFrame.bind(eventMeter);
  eventMeter.recordFrame = (duration, isCanvas) => {
    recordFrameCalled = true;
    originalRecord(duration, isCanvas);
  };
  eventApp.emit('term:render-frame', { durationMs: 16.6, isCanvas: true });
  assert.equal(recordFrameCalled, true);

  eventMeter.destroy();
  assert.equal(eventMeter.enabled, false);
});

test('FpsMeter handles term:render-frame and term:pref-change via EventEmitter', async () => {
  const { FpsMeter } = await import('../src/plugins/fps_meter/index.js');
  const mockApp = new EventEmitter();
  const meter = new FpsMeter(mockApp);
  meter.init({ app: mockApp });

  assert.equal(meter.enabled, false);
  mockApp.emit('term:pref-change', { key: 'enableFpsMeter', value: true });
  assert.equal(meter.enabled, true);

  mockApp.emit('term:pref-change', { key: 'useCanvasEngine', value: true });
  assert.equal(meter.isCanvas, true);

  let recorded = null;
  meter.recordFrame = (duration, isCanvas) => {
    recorded = { duration, isCanvas };
  };
  mockApp.emit('term:render-frame', { durationMs: 14.2, isCanvas: true });
  assert.deepEqual(recorded, { duration: 14.2, isCanvas: true });

  meter.destroy();
  assert.equal(meter.enabled, false);
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

  const mockApp = new EventEmitter();
  mockApp.onPrefChange = () => {};
  const hudPlugin = new hudModule.TouchDebugHUDPlugin(mockApp);
  hudPlugin.init({ app: mockApp });
  assert.equal(mockApp.touchDebugHUD, undefined);
  assert.equal(hudPlugin.id, 'touch_debug_hud');
  assert.equal(hudPlugin.prefKey, 'enableTouchDebugHUD');
  assert.equal(hudPlugin.icon, 'debug');

  assert.equal(typeof hudPlugin.renderOverlay, 'function');
  assert.equal(hudPlugin.renderOverlay({ app: mockApp }), null);
  hudPlugin.setEnabled(true);
  assert.equal(hudPlugin.enabled, true);
  const overlayNode = hudPlugin.renderOverlay({ app: mockApp });
  assert.ok(overlayNode);
  hudPlugin.setEnabled(false);
  assert.equal(hudPlugin.enabled, false);
  assert.equal(hudPlugin.renderOverlay({ app: mockApp }), null);
  hudPlugin.destroy();
});

test('MediaPreviewer resolveImageUrl resolves preview URLs according to whitelistOnly and enabled', async () => {
  const { MediaPreviewer } = await import('../src/plugins/media_previewer/index.js');
  const previewer = new MediaPreviewer();
  previewer.enabled = true;
  previewer.whitelistOnly = true;

  // Whitelisted domain returns resolved URL
  const valid = previewer.resolveImageUrl('https://imgur.com/abc1234');
  assert.equal(valid, 'https://i.imgur.com/abc1234.jpg');

  // Non-whitelisted domain returns null when whitelistOnly is true
  const untrusted = previewer.resolveImageUrl('https://untrusted.org/pic.png');
  assert.equal(untrusted, null);

  // When disabled, returns null
  previewer.enabled = false;
  assert.equal(previewer.resolveImageUrl('https://imgur.com/abc1234'), null);
});

test('MediaPreviewer handles term:hyperlink-preview event via EventEmitter', async () => {
  const { MediaPreviewer } = await import('../src/plugins/media_previewer/index.js');
  const mockApp = new EventEmitter();
  const previewer = new MediaPreviewer(mockApp, { enabled: true, whitelistOnly: true });
  previewer.init({ app: mockApp });

  const detail = { href: 'https://imgur.com/abc1234', request: null };
  mockApp.emit('term:hyperlink-preview', detail);
  assert.equal(detail.request, 'https://i.imgur.com/abc1234.jpg');

  // When disabled
  previewer.enabled = false;
  const detailDisabled = { href: 'https://imgur.com/abc1234', request: null };
  mockApp.emit('term:hyperlink-preview', detailDisabled);
  assert.equal(detailDisabled.request, null);

  // After destroy
  previewer.enabled = true;
  previewer.destroy();
  const detailDestroyed = { href: 'https://imgur.com/abc1234', request: null };
  mockApp.emit('term:hyperlink-preview', detailDestroyed);
  assert.equal(detailDestroyed.request, null);
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
  const mockBuf = new EventEmitter();
  mockBuf.app = new EventEmitter();
  mockBuf.app.on('term:login-prompt', () => { loginFired = true; });
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
  const mockBuf = new EventEmitter();
  mockBuf.app = new EventEmitter();
  mockBuf.app.on('term:login-prompt', () => { loginFired = true; });
  site.onData(mapleBig5, mockBuf);
  assert.equal(loginFired, true);
});

test('AutoSite onData fires login on 請輸入代號 without locking to PTT, and locks to maple3 on [您的帳號]', async () => {
  const { u2b } = await import('../src/js/string_util.js');

  // Case 1: Maple login prompt [您的帳號] locks AutoSite to maple3 and fires login
  const auto1 = new AutoSite();
  let fired1 = false;
  const mockBuf1 = new EventEmitter();
  mockBuf1.rows = 24;
  mockBuf1.cols = 80;
  mockBuf1.app = new EventEmitter();
  mockBuf1.app.on('term:login-prompt', () => { fired1 = true; });
  const mapleChunk = Uint8Array.from(u2b('   [您的帳號] '), c => c.charCodeAt(0));
  auto1.onData(mapleChunk, mockBuf1);
  assert.equal(auto1.name, 'maple3');
  assert.equal(auto1.isLocked, true);
  assert.equal(fired1, true);

  // Case 2: Generic BBS login prompt 請輸入代號 triggers login, but does NOT lock to PTT
  const auto2 = new AutoSite();
  let fired2 = false;
  const mockBuf2 = new EventEmitter();
  mockBuf2.rows = 24;
  mockBuf2.cols = 80;
  mockBuf2.app = new EventEmitter();
  mockBuf2.app.on('term:login-prompt', () => { fired2 = true; });
  const pttChunk = Uint8Array.from(u2b('請輸入代號，或以 guest 參觀: '), c => c.charCodeAt(0));
  auto2.onData(pttChunk, mockBuf2);
  assert.equal(fired2, true, '請輸入代號 must fire login event');
  assert.equal(auto2.isLocked, false, '請輸入代號 must NOT lock AutoSite to PTT');
});

test('Site.getThreadCommand enforces pageState filtering and App is fully decoupled from pageState / PAGE_STATE', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { Maple3Site } = await import('../src/js/sites/maple3.js');

  const ptt = new PttSite();
  const maple = new Maple3Site();

  // In MENU or OTHER pageState, thread navigation commands should return null
  ptt.pageState = PAGE_STATE.MENU;
  assert.equal(ptt.getThreadCommand('prevThread'), null);
  assert.equal(ptt.getThreadCommand('nextThread'), null);

  maple.pageState = PAGE_STATE.MENU;
  assert.equal(maple.getThreadCommand('prevThread'), null);
  assert.equal(maple.getThreadCommand('nextThread'), null);

  // In LIST, READING, and MAPLE_LIST, thread navigation commands should succeed
  ptt.pageState = PAGE_STATE.LIST;
  assert.equal(ptt.getThreadCommand('prevThread'), '[');
  assert.equal(ptt.getThreadCommand('nextThread'), ']');

  ptt.pageState = PAGE_STATE.READING;
  assert.equal(ptt.getThreadCommand('prevThread'), '[');
  assert.equal(ptt.getThreadCommand('nextThread'), ']');

  maple.pageState = PAGE_STATE.MAPLE_LIST;
  assert.equal(maple.getThreadCommand('prevThread'), '-');
  assert.equal(maple.getThreadCommand('nextThread'), '+');

  // Verify App does not reference pageState or PAGE_STATE
  const appSrc = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  assert.ok(!appSrc.includes('pageState'), 'App must not directly inspect site.pageState');
  assert.ok(!appSrc.includes('PAGE_STATE'), 'App must not import or use PAGE_STATE');
});

test('ClipboardManager normalizes CRLF/LF and BaseSite.onPaste transforms ESC char', async () => {
  const { ClipboardManager } = await import('../src/js/clipboard.js');
  const clipboard = new ClipboardManager();

  assert.equal(clipboard.formatPasteText('line1\r\nline2\nline3'), 'line1\rline2\rline3');

  let prevented = false;
  const domPasteText = clipboard.handleDOMPaste({
    clipboardData: {
      getData: (type) => (type === 'text/plain' ? 'a\r\nb\nc' : ''),
    },
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(domPasteText, 'a\rb\rc');
  assert.equal(prevented, true);

  const pasteEvent = clipboard.createPasteEvent('foo\r\nbar\nbaz');
  assert.equal(pasteEvent.data, 'foo\rbar\rbaz');

  const ptt = new PttSite();
  const maple = new Maple3Site();
  const auto = new AutoSite();

  // PTT replaces \x1b with \x15 (Ctrl-U) via event handler
  const pttEvt = clipboard.createPasteEvent('line1\r\nline2\n\x1b[1;31mred\x1b[m');
  ptt.onPaste(pttEvt);
  assert.equal(pttEvt.data, 'line1\rline2\r\x15[1;31mred\x15[m');

  // Maple3 replaces \x1b with \x03 (Ctrl-C) via event handler
  const mapleEvt = { text: 'line1\rline2\r\x1b[1;31mred\x1b[m' };
  maple.onPaste(mapleEvt);
  assert.equal(mapleEvt.text, 'line1\rline2\r\x03[1;31mred\x03[m');

  // AutoSite delegates onPaste to active site (defaults to PTT, switches when locked to Maple3)
  const autoEvt1 = { data: 'a\rb\x1b[m' };
  auto.onPaste(autoEvt1);
  assert.equal(autoEvt1.data, 'a\rb\x15[m');

  auto.lockSite('maple3');
  const autoEvt2 = { data: 'a\rb\x1b[m' };
  auto.onPaste(autoEvt2);
  assert.equal(autoEvt2.data, 'a\rb\x03[m');

  // ClipboardManager.completePaste invokes view.buf.site.onPaste(event) before sending to view.paste
  let finalPasted = null;
  const mockView = {
    buf: { site: ptt },
    paste: (str) => {
      finalPasted = str;
    },
  };
  const completeEvt = clipboard.createPasteEvent('hello\r\n\x1b[1;33myellow\x1b[m');
  assert.equal(clipboard.completePaste(mockView, completeEvt), true);
  assert.equal(finalPasted, 'hello\r\x15[1;33myellow\x15[m');
});

test('EasyReading fixes: mouse clicks, coordinate/cursor mapping, Escape toggle, 100% navigation, push/reply cleanup, and multi-page ANSI copy', async () => {
  const { EasyReading } = await import('../src/plugins/easy_reading/EasyReading.js');
  const { MouseBrowsing } = await import('../src/plugins/mouse_browsing/MouseBrowsing.js');
  const { InputInterceptors } = await import('../src/js/input_interceptors.js');
  const { TermBuf } = await import('../src/js/term_buf.js');

  const ptt = new PttSite();
  const buf = new TermBuf(80, 24);
  buf.site = ptt;

  // 1. PttSite deterministic getPagingSlice on normal page turns vs last page
  const statusNormal = { pageIndex: 2, rowIndexStart: 22, rowIndexEnd: 44, isEnd: false };
  const sliceNormal = ptt.getPagingSlice(buf, statusNormal, 22, [buf.lines[0]]);
  assert.deepEqual(sliceNormal, { beginIndex: 1, atLastPage: false });

  // 2. Multi-page ANSI selection copy beyond row 24 in TermBuf
  const multiPageLines = [];
  for (let r = 0; r < 40; r++) {
    const line = [];
    for (let c = 0; c < 80; c++) {
      line.push({
        ch: r === 30 && c < 4 ? 'TEST'[c] : ' ',
        fg: 1,
        bg: 0,
        bright: true,
        isLeadByte: false,
        getBg() { return this.bg; },
        getFg() { return this.fg; },
      });
    }
    multiPageLines.push(line);
  }
  const ansiOut = buf.getSelectionText(
    { start: { row: 30, col: 0 }, end: { row: 30, col: 4 } },
    { color: true, lines: multiPageLines }
  );
  assert.ok(ansiOut.includes('TEST'), 'getSelectionText should extract text from row 30 of custom lines array');

  // 3. Set up EasyReading and InputInterceptors with mock DOM
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
      removeEventListener() {},
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

  const mockContainer = createElement('div');
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement,
      getElementById: (id) => (id === 'TermWindow' ? mockContainer : null),
    };

    const sent = [];
    const interceptors = new InputInterceptors();
    let cursorUpdates = 0;
    const mockView = {
      termWin: mockContainer,
      chw: 10,
      chh: 20,
      fontSizePx: 20,
      scaleX: 1,
      scaleY: 1,
      innerBounds: { width: 800, height: 600 },
      _getGridOrigin: () => [0, 60],
      convertMN2XYEx: (col, row) => [col * 10, 60 + row * 20],
      updateCursorPos: () => { cursorUpdates++; },
      renderRow: (line, row, forceWidth, preview, el) => {
        el.setAttribute('data-rendered-width', String(forceWidth));
      },
    };
    const mockApp = {
      site: ptt,
      buf,
      view: mockView,
      inputInterceptors: interceptors,
      registerInputInterceptor: (i) => interceptors.registerInterceptor(i),
      unregisterInputInterceptor: (i) => interceptors.unregisterInterceptor(i),
      conn: { isConnected: true },
      send: (d) => sent.push(d),
      setNavCmd(cmd) {
        if (this.inputInterceptors.dispatchNavCmd(cmd)) return;
      },
      on: () => {},
      off: () => {},
      emit: () => {},
    };

    const er = new EasyReading(mockApp, { enabled: true });
    er.init({ app: mockApp, view: mockView, buf });
    er.started = true;
    er.show();
    assert.equal(er.isActive(), true);

    // 4. appendRows sets 0-based srow and passes forceWidth (fontSizePx = 20)
    er.appendRows([buf.lines[0], buf.lines[1]], false);
    assert.equal(er.content.childNodes[0].getAttribute('srow'), '0');
    assert.equal(er.content.childNodes[1].getAttribute('srow'), '1');
    assert.equal(er.content.childNodes[0].getAttribute('data-rendered-width'), '20');

    // 5. Normal left click when MouseBrowsing is disabled does NOT close EasyReading
    er.handleMouseClick({ button: 0, clientX: 200, clientY: 200, preventDefault() {} });
    assert.equal(er.isActive(), true, 'Left click must not close EasyReading when MouseBrowsing is disabled');

    // 6. getCursorPos returns 'hide' while reading, and undefined when exited to terminal
    assert.equal(interceptors.getCursorPos(0, 23), 'hide');
    er.leaveToTerminal();
    const terminalCursorPos = interceptors.getCursorPos(5, 23);
    assert.equal(terminalCursorPos, undefined, 'getCursorPos should return undefined when exited to terminal so TermView uses native coordinates');
    er.show();

    // 7. Escape temporarily hides overlay without clearing pageLines; pressing Escape again restores it
    er.pageLines = [buf.lines[0], buf.lines[1]];
    let prevented = false;
    er.handleKeyDown({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(er.isActive(), false);
    assert.equal(er._temporarilyHidden, true);
    assert.equal(er.pageLines.length, 2, 'Escape must preserve loaded pageLines');

    prevented = false;
    er.handleKeyDown({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(er.isActive(), true);
    assert.equal(er._temporarilyHidden, false);

    // 8. Space / ArrowRight / t at 100% end of article calls leaveCurrentPost and passes key through
    er.easyReadingReachedPageEnd = true;
    er.content.scrollTop = 1000;
    er.content.scrollHeight = 500;
    er.content.clientHeight = 500;
    let leftPost = false;
    const origLeave = er.leaveCurrentPost.bind(er);
    er.leaveCurrentPost = () => { leftPost = true; origLeave(); };
    prevented = false;
    er.handleKeyDown({ key: ' ', preventDefault() { prevented = true; } });
    assert.equal(leftPost, true, 'Pressing Space at 100% bottom should call leaveCurrentPost');
    assert.equal(prevented, false, 'Space at 100% should pass through to PTT');

    // 9. Pressing q or ArrowLeft does NOT immediately hide overlay (avoids flashing raw terminal article before list renders)
    er.show();
    assert.equal(er.isActive(), true);
    er.handleKeyDown({ key: 'q', preventDefault() {} });
    assert.equal(er.isActive(), true, 'Overlay must remain visible while waiting for article list frame from server');

    // When scheduleHide runs with requestAnimationFrame, it waits for next frame before hiding
    const rafCallbacks = [];
    const origWindow = globalThis.window;
    try {
      globalThis.window = {
        requestAnimationFrame: (cb) => {
          rafCallbacks.push(cb);
          return rafCallbacks.length;
        },
        cancelAnimationFrame: () => {},
      };
      ptt.pageState = PAGE_STATE.LIST;
      er.scheduleHide();
      assert.equal(er.isActive(), true, 'Overlay should still be visible before RAF fires');
      assert.equal(rafCallbacks.length, 1);
      // First RAF (before paint commit)
      rafCallbacks.shift()();
      assert.equal(er.isActive(), true, 'Overlay should wait for paint frame commit');
      assert.equal(rafCallbacks.length, 1);
      // Second RAF (after Canvas/DOM list frame is painted)
      rafCallbacks.shift()();
      assert.equal(er.isActive(), false, 'Overlay hides cleanly on next frame after list is painted');
    } finally {
      globalThis.window = origWindow;
    }
  } finally {
    globalThis.document = originalDoc;
  }
});

test('EasyReading exits directly to terminal on y (reply) and X (push) and delegates input natively', () => {
  const originalDoc = globalThis.document;
  const mockElements = new Map();
  const createEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {
        display: '',
        setProperty(k, v) { this[k] = v; },
        getPropertyValue(k) { return this[k] || ''; },
      },
      attributes: {},
      childNodes: [],
      innerHTML: '',
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
      offsetHeight: 20,
      offsetTop: 460,
      setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') mockElements.set(v, this); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.childNodes.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
      },
      get lastChild() {
        return this.childNodes[this.childNodes.length - 1] || null;
      },
      addEventListener() {},
      removeEventListener() {},
      contains(target) { return target === this || this.childNodes.includes(target); },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: 800, height: 480 };
      },
    };
    return el;
  };

  globalThis.document = {
    createElement: createEl,
    getElementById: (id) => mockElements.get(id) || null,
  };

  try {
    const ptt = new PttSite();
    ptt.pageState = PAGE_STATE.READING;
    ptt.prevPageState = PAGE_STATE.LIST;

    const createLine = (text, bg = 0, fg = 7) =>
      Array.from({ length: 80 }, (_, i) => ({
        ch: text[i] || ' ',
        getBg: () => bg,
        getFg: () => fg,
      }));

    const lines = Array.from({ length: 24 }, (_, r) => createLine(`Article row ${r}`));
    const statusText = '  瀏覽 第 1/1 頁 (100%)  目前顯示: 第 01~23 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
    lines[23] = createLine(statusText, 4, 7);

    const mockBuf = Object.assign(new EventEmitter(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
      site: ptt,
      hasFrameSync: true,
      inSyncUpdate: false,
      lines,
      isFrameReady() {
        return !this.inSyncUpdate;
      },
      isLineEmpty(row) {
        return this.getRowText(row).trim().length === 0;
      },
      getRowText(row) {
        if (!this.lines[row]) return '';
        return this.lines[row].map((c) => c.ch).join('');
      },
    });

    const mockView = {
      chw: 10,
      chh: 20,
      scaleX: 1.35, // Simulate Stretch Font (fontFitWindowWidth)
      scaleY: 1.0,
      fontSizePx: 20,
      termWin: createEl('div'),
      mainDisplay: { style: { fontSize: '20px', lineHeight: '20px' } },
      _getGridOrigin: () => [0, 0],
      convertMN2XYEx: (col, row) => [col * 10 * 1.35, row * 20],
      updateCursorPos() {},
      renderSingleRow(target, row) {
        target.textContent = row.map((c) => c.ch).join('').trim();
      },
    };

    const sentData = [];
    const mockApp = Object.assign(new EventEmitter(), {
      buf: mockBuf,
      view: mockView,
      site: ptt,
      send(data) { sentData.push(data); },
      registerInputInterceptor() {},
      unregisterInputInterceptor() {},
    });

    const er = new EasyReading();
    er.init({ app: mockApp, view: mockView, buf: mockBuf });
    er.setEnabled(true);

    // 1. Initial article load via onScreenUpdate
    er.onScreenUpdate(lines);
    assert.equal(er.started, true);
    assert.equal(er.isActive(), true, 'EasyReading overlay is active');
    assert.equal(er.getCursorPos(79, 23), 'hide', 'Cursor is hidden while EasyReading overlay is active');

    // 2. User presses 'y' in EasyReading -> exits immediately to terminal and passes key through
    let keyPrevented = false;
    const interceptedY = er.handleKeyDown({
      key: 'y',
      ctrlKey: false,
      altKey: false,
      preventDefault() { keyPrevented = true; },
    });
    assert.equal(interceptedY, false, 'handleKeyDown must return false so TermKeyboard sends y to terminal');
    assert.equal(keyPrevented, false, 'Key event must not be prevented');
    assert.equal(er.isActive(), false, 'EasyReading overlay immediately hides when y is pressed');
    assert.equal(er._temporarilyHidden, true, '_temporarilyHidden is true while in terminal mode');
    assert.equal(
      er.getCursorPos(52, 22),
      undefined,
      'getCursorPos returns undefined when exited to terminal so TermView uses native Stretch Font coordinates'
    );

    // PTT responds with reply prompt on Row 22 while Row 23 still says 瀏覽
    const replyPromptText = '▲ 回應至 (F)看板 (M)作者信箱 (B)二者皆是 (Q)取消？[F] ';
    lines[22] = createLine(replyPromptText);
    mockBuf.cur_y = 22;
    mockBuf.cur_x = 52;
    er.onScreenUpdate([lines[22], lines[23]]);
    assert.equal(er.isActive(), false, 'EasyReading overlay stays hidden during reply prompt updates');
    assert.equal(sentData.includes('\x1b[6~'), false, 'Must NEVER send PageDown into PTT getdata() prompt');

    // Subsequent keys (like 'Enter', 'q', '1', typing) pass straight through to terminal and keep overlay hidden
    const interceptedSubKey = er.handleKeyDown({
      key: 'Enter',
      ctrlKey: false,
      altKey: false,
      preventDefault() {},
    });
    assert.equal(interceptedSubKey, false);
    assert.equal(er.isActive(), false, 'Overlay stays hidden while typing in terminal');

    // 3. User finishes/cancels prompt and cursor parks back at (23, 79)
    lines[22] = createLine('Article row 22');
    mockBuf.cur_y = 23;
    mockBuf.cur_x = 79;
    er.onScreenUpdate([lines[22], lines[23]]);
    assert.equal(er.isActive(), false, 'Stays in terminal view at bottom of article after prompt finishes');

    // Pressing Escape at idle reading screen returns to EasyReading
    let escPrevented = false;
    const interceptedEsc = er.handleKeyDown({
      key: 'Escape',
      ctrlKey: false,
      altKey: false,
      preventDefault() { escPrevented = true; },
    });
    assert.equal(interceptedEsc, true, 'Escape at idle terminal reading screen toggles EasyReading back on');
    assert.equal(escPrevented, true);
    assert.equal(er.isActive(), true, 'EasyReading overlay is shown again');

    // 4. User presses 'X' in EasyReading -> exits immediately to terminal
    const interceptedX = er.handleKeyDown({
      key: 'X',
      ctrlKey: false,
      altKey: false,
      preventDefault() {},
    });
    assert.equal(interceptedX, false, 'X passes through to terminal');
    assert.equal(er.isActive(), false, 'EasyReading overlay immediately hides on X');

    // 5. Leaving article to LIST resets state so next article opens in EasyReading automatically
    ptt.prevPageState = PAGE_STATE.READING;
    ptt.pageState = PAGE_STATE.LIST;
    er.onScreenUpdate(lines);
    assert.equal(er._temporarilyHidden, false, 'Leaving to LIST resets _temporarilyHidden');

    // Entering next article from LIST opens EasyReading automatically
    ptt.prevPageState = PAGE_STATE.LIST;
    ptt.pageState = PAGE_STATE.READING;
    er.onScreenUpdate(lines);
    assert.equal(er.isActive(), true, 'Next article opens in EasyReading automatically');
  } finally {
    globalThis.document = originalDoc;
  }
});

test('EasyReading works without DEC 2026 (hasFrameSync: false) for split TCP chunks and server-triggered prompts', () => {
  const originalDoc = globalThis.document;
  const mockElements = new Map();
  const createEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {
        display: '',
        setProperty(k, v) { this[k] = v; },
        getPropertyValue(k) { return this[k] || ''; },
      },
      attributes: {},
      childNodes: [],
      innerHTML: '',
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
      offsetHeight: 20,
      offsetTop: 460,
      setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') mockElements.set(v, this); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.childNodes.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
      },
      get lastChild() {
        return this.childNodes[this.childNodes.length - 1] || null;
      },
      addEventListener() {},
      removeEventListener() {},
      contains(target) { return target === this || this.childNodes.includes(target); },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: 800, height: 480 };
      },
    };
    return el;
  };

  globalThis.document = {
    createElement: createEl,
    getElementById: (id) => mockElements.get(id) || null,
  };

  try {
    const ptt = new PttSite();
    ptt.pageState = PAGE_STATE.READING;
    ptt.prevPageState = PAGE_STATE.LIST;

    const createLine = (text, bg = 0, fg = 7) =>
      Array.from({ length: 80 }, (_, i) => ({
        ch: text[i] || ' ',
        getBg: () => bg,
        getFg: () => fg,
      }));

    const lines = Array.from({ length: 24 }, (_, r) => createLine(`Page 1 row ${r}`));
    const statusPage1 = '  瀏覽 第 1/2 頁 ( 50%)  目前顯示: 第 01~23 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
    lines[23] = createLine(statusPage1, 7, 0);

    const mockBuf = Object.assign(new EventEmitter(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
      site: ptt,
      hasFrameSync: false,
      inSyncUpdate: false,
      lines,
      isFrameReady() {
        if (this.hasFrameSync) return !this.inSyncUpdate;
        return this.site.isCursorParked(this);
      },
      isLineEmpty(row) {
        return this.getRowText(row).trim().length === 0;
      },
      getRowText(row) {
        if (!this.lines[row]) return '';
        return this.lines[row].map((c) => c.ch).join('');
      },
    });

    const mockView = {
      chw: 10,
      chh: 20,
      scaleX: 1,
      scaleY: 1,
      fontSizePx: 20,
      termWin: createEl('div'),
      mainDisplay: { style: { fontSize: '20px', lineHeight: '20px' } },
      _getGridOrigin: () => [0, 0],
      convertMN2XYEx: (col, row) => [col * 10, row * 20],
      updateCursorPos() {},
      renderSingleRow(target, row) {
        target.textContent = row.map((c) => c.ch).join('').trim();
      },
    };

    const mockApp = Object.assign(new EventEmitter(), {
      buf: mockBuf,
      view: mockView,
      site: ptt,
      send() {},
      registerInputInterceptor() {},
      unregisterInputInterceptor() {},
    });

    const er = new EasyReading();
    er.init({ app: mockApp, view: mockView, buf: mockBuf });
    er.setEnabled(true);

    // 1. Page 1 arrives complete (cur_x = 79, cur_y = 23)
    er.onScreenUpdate(lines);
    assert.equal(er.content.childNodes.length, 23, 'Page 1 appends 23 rows');
    assert.equal(er._lastEasyReadingPageIndex, 1);

    // 2. Page 2 arrives in split TCP chunks (Chunk 1: status row updated to page 2, but cursor at (10, 40) mid-screen)
    const statusPage2 = '  瀏覽 第 2/2 頁 (100%)  目前顯示: 第 23~45 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
    lines[23] = createLine(statusPage2, 4, 7);
    mockBuf.cur_y = 10;
    mockBuf.cur_x = 40;
    er.onScreenUpdate(lines);
    assert.equal(er.content.childNodes.length, 23, 'Must NOT append half-drawn page 2 while cursor is not parked');
    assert.equal(er._lastEasyReadingPageIndex, 1, 'Must NOT advance _lastEasyReadingPageIndex on incomplete frame');

    // Chunk 2 arrives: cursor parks at (23, 79)
    for (let r = 0; r < 23; r++) {
      lines[r] = createLine(`Page 2 row ${r}`);
    }
    mockBuf.cur_y = 23;
    mockBuf.cur_x = 79;
    er.onScreenUpdate(lines);
    assert.equal(er._lastEasyReadingPageIndex, 2, 'Advances to page 2 once cursor parks at (23, 79)');
    assert.ok(er.content.childNodes.length > 23, 'Appends page 2 rows once frame is complete');

    // 3. Even if 'y' or 'X' prompt is triggered via touch/macro without keydown event, _onChanged automatically exits to terminal
    lines[23] = createLine('您覺得這篇文章 1.推 2.噓 3.→ [1]? ', 4, 7);
    mockBuf.cur_y = 23;
    mockBuf.cur_x = 31;
    er.onScreenUpdate([lines[23]]);
    assert.equal(er.isActive(), false, 'Automatically exits EasyReading to terminal when push prompt appears');
    assert.equal(er._temporarilyHidden, true);
  } finally {
    globalThis.document = originalDoc;
  }
});

test('EasyReading handles enabling after login, toggling off/on with forced redraw, and leaving multi-page articles early without sticking at 100%', () => {
  const originalDoc = globalThis.document;
  const mockElements = new Map();
  const createEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {
        setProperty(k, v) { this[k] = v; },
      },
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; },
      },
      attributes: {},
      childNodes: [],
      innerHTML: '',
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
      offsetHeight: 20,
      offsetTop: 460,
      setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') mockElements.set(v, this); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.childNodes.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
      },
      get lastChild() {
        return this.childNodes[this.childNodes.length - 1] || null;
      },
      addEventListener() {},
      removeEventListener() {},
      contains(target) { return target === this || this.childNodes.includes(target); },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: 800, height: 480 };
      },
    };
    return el;
  };

  globalThis.document = {
    createElement: createEl,
    getElementById: (id) => mockElements.get(id) || null,
  };

  try {
    const ptt = new PttSite();
    ptt.pageState = PAGE_STATE.LIST;
    ptt.prevPageState = PAGE_STATE.LIST;

    const createLine = (text, bg = 0, fg = 7) =>
      Array.from({ length: 80 }, (_, i) => ({
        ch: text[i] || ' ',
        getBg: () => bg,
        getFg: () => fg,
      }));

    const lines = Array.from({ length: 24 }, (_, r) => createLine(`Row ${r}`));
    const sentCommands = [];

    const mockBuf = Object.assign(new EventEmitter(), {
      cols: 80,
      rows: 24,
      cur_x: 79,
      cur_y: 23,
      site: ptt,
      hasFrameSync: false,
      inSyncUpdate: false,
      lines,
      isFrameReady() {
        if (this.hasFrameSync) return !this.inSyncUpdate;
        return this.site.isCursorParked(this);
      },
      isLineEmpty(row) {
        return this.getRowText(row).trim().length === 0;
      },
      getRowText(row) {
        if (!this.lines[row]) return '';
        return this.lines[row].map((c) => c.ch).join('');
      },
    });

    const mockView = {
      chw: 10,
      chh: 20,
      scaleX: 1,
      scaleY: 1,
      fontSizePx: 20,
      termWin: createEl('div'),
      mainDisplay: { style: { fontSize: '20px', lineHeight: '20px' } },
      _getGridOrigin: () => [0, 0],
      convertMN2XYEx: (col, row) => [col * 10, row * 20],
      updateCursorPos() {},
      renderSingleRow(target, row) {
        target.textContent = row.map((c) => c.ch).join('').trim();
      },
    };

    const mockApp = Object.assign(new EventEmitter(), {
      buf: mockBuf,
      view: mockView,
      site: ptt,
      send(cmd) { sentCommands.push(cmd); },
      registerInputInterceptor() {},
      unregisterInputInterceptor() {},
    });

    // Scenario 1: EasyReading disabled at login, enabled later during use
    const er = new EasyReading();
    er.init({ app: mockApp, view: mockView, buf: mockBuf, enabled: false });
    assert.equal(er.enabled, false);

    // Enable EasyReading while on article list
    er.setEnabled(true);
    assert.equal(er.enabled, true);
    assert.equal(er.ignoreOneUpdate, false, 'Enabling EasyReading must not set ignoreOneUpdate = true');

    // Open a 3-page article (Page 1 arrives)
    ptt.prevPageState = PAGE_STATE.LIST;
    ptt.pageState = PAGE_STATE.READING;
    const statusPage1 = '  瀏覽 第 1/3 頁 ( 33%)  目前顯示: 第 01~23 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
    lines[23] = createLine(statusPage1, 7, 0);

    er.onScreenUpdate(lines, false);
    assert.equal(er.sendCommandAfterUpdate, '\x1b[6~', 'Page 1 must queue PageDown command');
    assert.equal(er._pageDownInFlight, true);
    mockBuf.emit('viewUpdate');
    assert.deepEqual(sentCommands, ['\x1b[6~'], 'PageDown command sent on viewUpdate');
    sentCommands.length = 0;

    // Scenario 2: Leave multi-page article early (before reaching 100%) back to LIST
    er.leaveCurrentPost();
    ptt.prevPageState = PAGE_STATE.READING;
    ptt.pageState = PAGE_STATE.LIST;
    lines[23] = createLine('  文章選讀  (y)回應 (X)推文 (←)離開 ', 7, 0);
    er.onScreenUpdate(lines, false);
    assert.equal(er.ignoreOneUpdate, false, 'Returning to LIST clears ignoreOneUpdate');

    // Open another multi-page article (Page 1 arrives) - should NOT be ignored!
    ptt.prevPageState = PAGE_STATE.LIST;
    ptt.pageState = PAGE_STATE.READING;
    lines[23] = createLine(statusPage1, 7, 0);
    er.onScreenUpdate(lines, false);
    assert.equal(er.sendCommandAfterUpdate, '\x1b[6~', 'Subsequent article Page 1 must queue PageDown');
    mockBuf.emit('viewUpdate');
    assert.deepEqual(sentCommands, ['\x1b[6~']);
    sentCommands.length = 0;

    // Scenario 3: Toggle EasyReading OFF and ON while reading an article, followed by forced UI redraw
    er.setEnabled(false);
    assert.equal(er.ignoreOneUpdate, false, 'Disabling EasyReading must clear ignoreOneUpdate');

    er.setEnabled(true);
    assert.deepEqual(sentCommands, ['\x1b[D\x1b[C'], 'Re-enabling during READING sends re-enter command');
    assert.equal(er._reenteringArticle, true);
    sentCommands.length = 0;

    // Synchronous forced UI redraw (from applyTermSizeMode / redraw(true)) fires before server responds
    er.onScreenUpdate(lines, true);
    assert.equal(er._reenteringArticle, true, 'Forced redraw must not clear _reenteringArticle');
    assert.equal(er._pageDownInFlight, false, 'Forced redraw must not start in-flight PageDown on stale buffer');
    assert.equal(er._changeHandled, false, 'Forced redraw must not set _changeHandled');

    // Server responds with re-entered Page 1 of the article
    er.onScreenUpdate(lines, false);
    assert.equal(er._reenteringArticle, false, 'Server response clears _reenteringArticle');
    assert.equal(er.sendCommandAfterUpdate, '\x1b[6~', 'Re-entered Page 1 queues PageDown command');
    mockBuf.emit('viewUpdate');
    assert.deepEqual(sentCommands, ['\x1b[6~'], 'PageDown sent after re-entering article');
  } finally {
    globalThis.document = originalDoc;
  }
});

test('Terminal site.filterWheelScroll and EasyReading stop continuous wheel scroll at top/bottom boundaries and jump to prev/next article after pause', () => {
  const ptt = new PttSite();
  const createLine = (text, bg = 0, fg = 7) =>
    Array.from({ length: 80 }, (_, i) => ({
      ch: text[i] || ' ',
      getBg: () => bg,
      getFg: () => fg,
    }));

  const lines = Array.from({ length: 24 }, (_, r) => createLine(`Row ${r}`));
  lines[0] = createLine(' 作者  tester (Tester)                                      看板  TestBoard ');
  lines[1] = createLine(' 標題  [測試] 邊界連續滾動測試                                              ');
  lines[2] = createLine(' 時間  Mon Sep 14 09:30:00 2026                                             ');

  const mockBuf = {
    cols: 80,
    rows: 24,
    lines,
    isLineEmpty: () => false,
    getRowText(row) {
      if (!this.lines[row]) return '';
      return this.lines[row].map((c) => c.ch).join('');
    },
  };

  // 1. Enter article on Page 1 of 2 (50%, rows 1~23) at t = 1000
  const statusPage1 = '  瀏覽 第 1/2 頁 ( 50%)  目前顯示: 第 01~23 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
  lines[23] = createLine(statusPage1, 7, 0);
  ptt.setPageState(mockBuf);
  ptt._readingEnterTime = 1000;

  // Immediate upward scroll within 400ms of entry is blocked (justEntered)
  let res = ptt.filterWheelScroll(mockBuf, {
    direction: 'up',
    isContinuous: false,
    cmd: 'doArrowUp',
    count: 1,
    now: 1200,
  });
  assert.equal(res.prevent, true, 'Reflex upward scroll immediately after entering article at top is blocked');

  // At t = 2000 (> 400ms after entry), continuous upward scroll at top is blocked
  res = ptt.filterWheelScroll(mockBuf, {
    direction: 'up',
    isContinuous: true,
    cmd: 'doArrowUp',
    count: 3,
    now: 2000,
  });
  assert.equal(res.prevent, true, 'Continuous upward scroll at article top is blocked');

  // At t = 2500 (paused > 350ms, isContinuous: false), upward scroll at top jumps to previous article
  res = ptt.filterWheelScroll(mockBuf, {
    direction: 'up',
    isContinuous: false,
    cmd: 'doPageUp',
    count: 1,
    now: 2500,
  });
  assert.equal(res.prevent, false, 'Paused upward scroll at top is allowed');
  assert.equal(res.maxSteps, 1, 'Jump allows exactly 1 step');
  assert.equal(res.overrideCmd, 'doArrowUp', 'PageUp at top overrides to doArrowUp so PTT jumps to previous article');

  // 2. When at row 3 (2 lines away from top), arrow-5 clamps maxSteps to 2 so it lands cleanly on line 1
  const statusRow3 = '  瀏覽 第 1/2 頁 ( 55%)  目前顯示: 第 03~25 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
  lines[23] = createLine(statusRow3, 7, 0);
  res = ptt.filterWheelScroll(mockBuf, {
    direction: 'up',
    isContinuous: true,
    cmd: 'doArrowUp',
    count: 5,
    now: 3500,
  });
  assert.equal(res.prevent, false);
  assert.equal(res.maxSteps, 2, 'Multi-line upward arrow scroll clamps steps to reach rowIndexStart=1 without overshooting');

  // 3. Scroll down to bottom (100%)
  const statusEnd = '  瀏覽 第 2/2 頁 (100%)  目前顯示: 第 20~42 行 (y)回應(X%)推文(h)說明 (←/q)離開 ';
  lines[23] = createLine(statusEnd, 4, 7);
  ptt._readingEnterTime = 1000;

  // Continuous downward scroll hitting 100% is blocked
  res = ptt.filterWheelScroll(mockBuf, {
    direction: 'down',
    isContinuous: true,
    cmd: 'doArrowDown',
    count: 3,
    now: 4000,
  });
  assert.equal(res.prevent, true, 'Continuous downward scroll at 100% is blocked');

  // Paused downward scroll at 100% jumps to next article (maxSteps: 1)
  res = ptt.filterWheelScroll(mockBuf, {
    direction: 'down',
    isContinuous: false,
    cmd: 'doArrowDown',
    count: 3,
    now: 4500,
  });
  assert.equal(res.prevent, false, 'Paused downward scroll at 100% is allowed');
  assert.equal(res.maxSteps, 1, 'Downward jump at 100% clamps to 1 step');
});

test('PttSite parseListRow and isMenuScreen recognize modern PTT show_status bar and xyz submenus without stateful regex issues', () => {
  const ptt = new PttSite();

  // Modern PTT show_status() rows (menu.c) with various pager modes
  const modernRows = [
    '9/15周二 16:20Valentines    線上12345人,我是hungte,呼叫器關閉      (h)說明',
    '9/15周二 8:05               線上1人,我是guest,呼叫器開啟          (h)說明',
    '12/31周日 23:59             線上9999人,我是sysop,呼叫器拔掉        (h)說明',
    '1/1周一 0:00NewYear         線上888人,我是user1,呼叫器防水        (h)說明',
    '5/20周五 13:14Love          線上520人,我是lover,呼叫器好友        (h)說明',
  ];

  for (const row of modernRows) {
    // Calling multiple times must consistently return true (no stateful /g lastIndex bug)
    assert.equal(parseListRow(row), true, `First call for: ${row}`);
    assert.equal(parseListRow(row), true, `Second call for: ${row}`);
  }

  // Submenus like xyz (【工具程式】, 【使用者統計資訊】, 【熱門話題與看板】) must be detected as MENU
  const xyzTitles = [
    '【工具程式】              批踢踢實業坊',
    '【使用者統計資訊】        批踢踢實業坊',
    '【熱門話題與看板】        批踢踢實業坊',
    '【個人設定】              批踢踢實業坊',
  ];

  for (const title of xyzTitles) {
    const mockXyzTerm = {
      rows: 24,
      cols: 80,
      cur_y: 12,
      cur_x: 20,
      isLineEmpty: () => false,
      getRowText: (r) => {
        if (r === 0) return title;
        if (r === 23) return modernRows[0];
        return '';
      },
    };
    assert.equal(ptt.isMenuScreen(mockXyzTerm), true, `${title} should be detected as menu screen`);
    assert.equal(ptt.setPageState(mockXyzTerm), PAGE_STATE.MENU);
  }
});

test('EasyReading exits cleanly when reading a long article from xyz menu without getting stuck or needing extra q', () => {
  const originalDoc = globalThis.document;
  const mockElements = new Map();
  const createEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {
        display: '',
        setProperty(k, v) { this[k] = v; },
        getPropertyValue(k) { return this[k] || ''; },
      },
      attributes: {},
      childNodes: [],
      innerHTML: '',
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
      offsetHeight: 20,
      offsetTop: 460,
      setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') mockElements.set(v, this); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.childNodes.push(child); child.parentNode = this; return child; },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
      },
      get lastChild() {
        return this.childNodes[this.childNodes.length - 1] || null;
      },
      addEventListener() {},
      removeEventListener() {},
      contains(target) { return target === this || this.childNodes.includes(target); },
      getBoundingClientRect() {
        return { top: 0, left: 0, width: 800, height: 480 };
      },
    };
    return el;
  };

  globalThis.document = {
    createElement: createEl,
    getElementById: (id) => mockElements.get(id) || null,
  };

  try {
    const ptt = new PttSite();
    const createLine = (text, bg = 0, fg = 7) =>
      Array.from({ length: 80 }, (_, i) => ({
        ch: text[i] || ' ',
        getBg: () => bg,
        getFg: () => fg,
      }));

    const lines = Array.from({ length: 24 }, (_, r) => createLine(`Row ${r}`));
    const sentCommands = [];

    const mockBuf = Object.assign(new EventEmitter(), {
      cols: 80,
      rows: 24,
      cur_x: 20,
      cur_y: 12,
      site: ptt,
      hasFrameSync: false,
      inSyncUpdate: false,
      lines,
      isFrameReady() {
        if (this.hasFrameSync) return !this.inSyncUpdate;
        return this.site.isCursorParked(this);
      },
      isLineEmpty(row) {
        return this.getRowText(row).trim().length === 0;
      },
      getRowText(row) {
        if (!this.lines[row]) return '';
        return this.lines[row].map((c) => c.ch).join('');
      },
    });

    const mockView = {
      chw: 10,
      chh: 20,
      scaleX: 1,
      scaleY: 1,
      fontSizePx: 20,
      termWin: createEl('div'),
      mainDisplay: { style: { fontSize: '20px', lineHeight: '20px' } },
      _getGridOrigin: () => [0, 0],
      convertMN2XYEx: (col, row) => [col * 10, row * 20],
      updateCursorPos() {},
      renderSingleRow(target, row) {
        target.textContent = row.map((c) => c.ch).join('').trim();
      },
    };

    const mockApp = Object.assign(new EventEmitter(), {
      buf: mockBuf,
      view: mockView,
      site: ptt,
      send(cmd) { sentCommands.push(cmd); },
      registerInputInterceptor() {},
      unregisterInputInterceptor() {},
    });

    const er = new EasyReading();
    er.init({ app: mockApp, view: mockView, buf: mockBuf });
    er.setEnabled(true);

    // 1. Start in xyz menu (【工具程式】)
    lines[0] = createLine('【工具程式】              批踢踢實業坊');
    lines[23] = createLine('9/15周二 16:20Valentines    線上12345人,我是hungte,呼叫器關閉      (h)說明');
    mockBuf.cur_x = 20;
    mockBuf.cur_y = 14;
    ptt.setPageState(mockBuf);
    assert.equal(ptt.pageState, PAGE_STATE.MENU);

    // 2. Enter a long article (e.g. GPL / user100 in pmore, Page 1 of 5 arrives)
    lines[0] = createLine('                    GNU GENERAL PUBLIC LICENSE');
    lines[23] = createLine('  瀏覽 第 1/5 頁 ( 20%)  目前顯示: 第 01~23 行 (y)回應(X%)推文(h)說明 (←/q)離開 ', 7, 0);
    mockBuf.cur_x = 79;
    mockBuf.cur_y = 23;
    ptt.setPageState(mockBuf);
    assert.equal(ptt.pageState, PAGE_STATE.READING);

    er.onScreenUpdate(lines, false);
    assert.equal(er.isActive(), true, 'EasyReading overlay is shown on Page 1');
    assert.equal(er._pageDownInFlight, true, 'PageDown is in flight for long article');
    mockBuf.emit('viewUpdate');
    assert.deepEqual(sentCommands, ['\x1b[6~'], 'Sent PageDown to fetch next page');
    sentCommands.length = 0;

    // 3. User presses 'q' to exit while PageDown is in flight
    let keyPrevented = false;
    const mockEvent = {
      key: 'q',
      ctrlKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
        keyPrevented = true;
      },
    };
    const handled = er.handleKeyDown(mockEvent);
    assert.equal(handled, true, 'q key is handled by EasyReading');
    assert.equal(keyPrevented, true);
    assert.deepEqual(sentCommands, ['\x1b[D'], 'Sends Left Arrow to exit pmore');
    assert.equal(er.ignoreOneUpdate, true, 'stopEasyReading + leaveCurrentPost preserves ignoreOneUpdate = true');
    sentCommands.length = 0;

    // 4. Stale in-flight Page 2 arrives from server before server processes Left Arrow
    lines[23] = createLine('  瀏覽 第 2/5 頁 ( 40%)  目前顯示: 第 23~45 行 (y)回應(X%)推文(h)說明 (←/q)離開 ', 7, 0);
    mockBuf.cur_x = 79;
    mockBuf.cur_y = 23;
    ptt.setPageState(mockBuf);
    er.onScreenUpdate(lines, false);
    mockBuf.emit('viewUpdate');
    assert.deepEqual(sentCommands, [], 'Must NOT send another PageDown on stale in-flight page');
    assert.equal(er.started, false, 'EasyReading stopped after ignoring stale page');

    // 5. Server processes Left Arrow and returns to xyz menu (【工具程式】)
    lines[0] = createLine('【工具程式】              批踢踢實業坊');
    lines[23] = createLine('9/15周二 16:20Valentines    線上12345人,我是hungte,呼叫器關閉      (h)說明');
    mockBuf.cur_x = 20;
    mockBuf.cur_y = 14;
    ptt.setPageState(mockBuf);
    assert.equal(ptt.pageState, PAGE_STATE.MENU, 'State cleanly transitions back to MENU');

    er.onScreenUpdate(lines, false);
    assert.equal(er.isActive(), false, 'EasyReading overlay hides cleanly without getting stuck');
  } finally {
    globalThis.document = originalDoc;
  }
});








