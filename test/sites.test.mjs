import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSite,
  getSiteProfile,
  BaseSite,
  PttSite,
  Maple3Site,
  AutoSite,
} from '../src/js/sites/index.js';
import {
  parseReplyText,
  parsePushInitText,
  parseReqNotMetText,
  parseStatusRow,
  parseListRow,
  parseWaterballRow,
  parseWaterball,
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
