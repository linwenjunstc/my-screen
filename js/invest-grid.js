/* ════════════════════════════════════════════════
 * invest-grid.js — 电子表格引擎 + 可编辑网格组件
 *
 * 模块：
 *   1. 公式引擎 — A1 记号解析 / AST 求值 / 依赖追踪 / 自动重算
 *   2. 网格渲染器 — 虚拟滚动 / 单元格编辑 / 选区 / 复制粘贴
 *   3. 模板系统 — 9 张测算表的结构 + 公式定义
 *
 * 依赖：pm-core.js（sb, currentUser, uid, escHtml, toast）
 * ════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────
 * Part 0: 工具函数
 * ─────────────────────────────────────────────── */

/** 列号 → A1 字母 (0→A, 1→B, ..., 25→Z, 26→AA) */
function colLetter(n) {
  var s = '';
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

/** A1 字母 → 列号 (A→0, B→1, ..., AA→26) */
function colIndex(s) {
  s = s.toUpperCase();
  var n = 0;
  for (var i = 0; i < s.length; i++) { n = n * 26 + (s.charCodeAt(i) - 64); }
  return n - 1;
}

/** 解析 A1 引用 → { sheet, col, row, colAbs, rowAbs, isRange, col2, row2 } */
function parseA1Ref(ref) {
  // 支持 'Sheet Name'!A1 或 Sheet!A1 或 A1
  var sheet = null;
  var rest = ref;
  var mSheet;
  if ((mSheet = rest.match(/^'([^']+)'!/))) {
    sheet = mSheet[1];
    rest = rest.slice(mSheet[0].length);
  } else if ((mSheet = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)!/))) {
    sheet = mSheet[1];
    rest = rest.slice(mSheet[0].length);
  }
  var m = rest.match(/^(\$?)([A-Z]+)(\$?)(\d+)(?::(\$?)([A-Z]+)(\$?)(\d+))?$/i);
  if (!m) return null;
  return {
    sheet: sheet,
    colAbs: m[1] === '$', col: colIndex(m[2]),
    rowAbs: m[3] === '$', row: parseInt(m[4]) - 1,
    isRange: !!m[5],
    col2Abs: m[6] === '$', col2: m[7] ? colIndex(m[7]) : -1,
    row2Abs: m[8] === '$', row2: m[9] ? parseInt(m[9]) - 1 : -1
  };
}

/** 将 (sheet, col, row) 转为内部 key: "sheetName!R{row}C{col}" */
function cellKey(sheetName, col, row) {
  return (sheetName || '') + '!R' + row + 'C' + col;
}

/** 格式化数值显示 */
function fmtNum(v, decimals) {
  if (v == null || isNaN(v)) return '';
  if (decimals == null) {
    decimals = (Math.abs(v) >= 1000 || Number.isInteger(v)) ? 0 : 2;
  }
  var neg = v < 0;
  v = Math.abs(v);
  var s = v.toFixed(decimals);
  var parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + parts.join('.');
}

function fmtPct(v) { return v != null ? (v * 100).toFixed(1) + '%' : ''; }

/* ───────────────────────────────────────────────
 * Part 1: 公式 Tokenizer
 * ─────────────────────────────────────────────── */

var TOK_NUM = 1, TOK_STR = 2, TOK_OP = 3, TOK_LPAREN = 4, TOK_RPAREN = 5;
var TOK_COMMA = 6, TOK_FUNC = 7, TOK_REF = 8, TOK_COLON = 9, TOK_COMP = 10;

function tokenizeFormula(formula) {
  var s = formula;
  var i = 0;
  var tokens = [];

  function isAlpha(ch) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'); }
  function isDigit(ch) { return ch >= '0' && ch <= '9'; }
  function isIdStart(ch) { return isAlpha(ch) || ch === '_'; }
  function isId(ch) { return isAlpha(ch) || isDigit(ch) || ch === '_' || ch === '.'; }

  while (i < s.length) {
    var ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

    // 数字
    if (isDigit(ch) || (ch === '.' && i + 1 < s.length && isDigit(s[i + 1]))) {
      var start = i;
      while (i < s.length && (isDigit(s[i]) || s[i] === '.')) i++;
      tokens.push({ type: TOK_NUM, value: parseFloat(s.slice(start, i)), raw: s.slice(start, i) });
      continue;
    }

    // 字符串
    if (ch === '"') {
      var start = ++i;
      while (i < s.length && s[i] !== '"') i++;
      tokens.push({ type: TOK_STR, value: s.slice(start, i), raw: '"' + s.slice(start, i) + '"' });
      i++; continue;
    }

    // 比较运算符
    if (ch === '=' || ch === '<' || ch === '>') {
      if (i + 1 < s.length && s[i + 1] === '=') { tokens.push({ type: TOK_COMP, value: ch + '=', raw: ch + '=' }); i += 2; }
      else if (i + 1 < s.length && s[i + 1] === '>') { tokens.push({ type: TOK_COMP, value: '<>', raw: '<>' }); i += 2; }
      else { tokens.push({ type: TOK_COMP, value: ch, raw: ch }); i++; }
      continue;
    }

    // 括号 / 逗号 / 冒号
    if (ch === '(') { tokens.push({ type: TOK_LPAREN, value: '(', raw: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TOK_RPAREN, value: ')', raw: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TOK_COMMA, value: ',', raw: ',' }); i++; continue; }
    if (ch === ':') { tokens.push({ type: TOK_COLON, value: ':', raw: ':' }); i++; continue; }

    // 运算符
    if ('+-*/^&'.indexOf(ch) !== -1) {
      tokens.push({ type: TOK_OP, value: ch, raw: ch }); i++; continue;
    }

    // 单引号括起来的表名引用 'Sheet Name'!A1
    if (ch === "'") {
      var start = i;
      i++; // 跳过开引号
      while (i < s.length && s[i] !== "'") i++;
      if (i < s.length && s[i] === "'") i++; // 跳过闭引号
      if (i < s.length && s[i] === '!') {
        i++; // 跳过 !
        while (i < s.length && (isAlpha(s[i]) || s[i] === '$' || isDigit(s[i]))) i++;
      }
      tokens.push({ type: TOK_REF, value: s.slice(start, i), raw: s.slice(start, i) });
      continue;
    }

    // 标识符（函数名 / 单元格引用 / 命名范围）
    if (isIdStart(ch)) {
      var start2 = i;
      while (i < s.length && isId(s[i])) i++;
      var word = s.slice(start2, i);
      // 看后面是不是 (
      var j = i;
      while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++;
      if (j < s.length && s[j] === '(') {
        tokens.push({ type: TOK_FUNC, value: word.toUpperCase(), raw: word });
      } else if (/^[A-Z]+\$?\d*$/i.test(word) || word.indexOf('!') !== -1) {
        // 可能是跨表引用，尝试向后合并
        if (i < s.length && s[i] === '!') {
          i++;
          while (i < s.length && (isAlpha(s[i]) || s[i] === '$' || isDigit(s[i]))) i++;
          tokens.push({ type: TOK_REF, value: s.slice(start2, i), raw: s.slice(start2, i) });
        } else {
          tokens.push({ type: TOK_REF, value: word, raw: word });
        }
      } else {
        // 可能是命名引用或跨表名前缀
        tokens.push({ type: TOK_REF, value: word, raw: word });
      }
      continue;
    }

    // 未知字符，跳过
    i++;
  }
  return tokens;
}

/* ───────────────────────────────────────────────
 * Part 2: 公式 AST 构建 + 求值
 * ─────────────────────────────────────────────── */

/**
 * AST 节点类型
 *   num, str, ref, rangeRef, op(+ - * / ^ &), comp(= <> < > <= >=),
 *   func(SUM,IF,MAX,MIN,AVERAGE,ABS,XIRR,EDATE,ROUND,SUMPRODUCT,COUNT),
 *   neg(一元负号)
 */
function buildAST(tokens, start, end) {
  if (start == null) start = 0;
  if (end == null) end = tokens.length;
  return _parseExpr(tokens, start, end).node;
}

function _parseExpr(tokens, i, end) {
  return _parseComp(tokens, i, end);
}

function _parseComp(tokens, i, end) {
  var r = _parseAddSub(tokens, i, end);
  while (r.i < end && tokens[r.i].type === TOK_COMP) {
    var op = tokens[r.i].value;
    r.i++;
    var right = _parseAddSub(tokens, r.i, end);
    r = { node: { type: 'comp', op: op, left: r.node, right: right.node }, i: right.i };
  }
  return r;
}

function _parseAddSub(tokens, i, end) {
  var r = _parseMulDiv(tokens, i, end);
  while (r.i < end && tokens[r.i].type === TOK_OP && (tokens[r.i].value === '+' || tokens[r.i].value === '-')) {
    var op = tokens[r.i].value;
    r.i++;
    var right = _parseMulDiv(tokens, r.i, end);
    r = { node: { type: 'op', op: op, left: r.node, right: right.node }, i: right.i };
  }
  return r;
}

function _parseMulDiv(tokens, i, end) {
  var r = _parseUnary(tokens, i, end);
  while (r.i < end && tokens[r.i].type === TOK_OP && (tokens[r.i].value === '*' || tokens[r.i].value === '/' || tokens[r.i].value === '^')) {
    var op = tokens[r.i].value;
    r.i++;
    var right = _parseUnary(tokens, r.i, end);
    r = { node: { type: 'op', op: op, left: r.node, right: right.node }, i: right.i };
  }
  return r;
}

function _parseUnary(tokens, i, end) {
  if (i < end && tokens[i].type === TOK_OP && tokens[i].value === '-') {
    i++;
    var r = _parseUnary(tokens, i, end);
    return { node: { type: 'neg', operand: r.node }, i: r.i };
  }
  return _parseAtom(tokens, i, end);
}

function _parseAtom(tokens, i, end) {
  if (i >= end) return { node: { type: 'num', value: 0 }, i: i };
  var t = tokens[i];
  if (t.type === TOK_NUM) { return { node: { type: 'num', value: t.value }, i: i + 1 }; }
  if (t.type === TOK_STR) { return { node: { type: 'str', value: t.value }, i: i + 1 }; }
  if (t.type === TOK_REF) {
    // 检查后面是否有冒号 = range ref
    if (i + 1 < end && tokens[i + 1].type === TOK_COLON && i + 2 < end && tokens[i + 2].type === TOK_REF) {
      return { node: { type: 'rangeRef', start: t.value, end: tokens[i + 2].value }, i: i + 3 };
    }
    return { node: { type: 'ref', value: t.value }, i: i + 1 };
  }
  if (t.type === TOK_LPAREN) {
    var r = _parseExpr(tokens, i + 1, end);
    if (r.i < end && tokens[r.i].type === TOK_RPAREN) r.i++;
    return r;
  }
  if (t.type === TOK_FUNC) {
    var name = t.value;
    i++;
    // 跳过 (
    if (i < end && tokens[i].type === TOK_LPAREN) i++;
    var args = [];
    while (i < end && tokens[i].type !== TOK_RPAREN) {
      var arg = _parseExpr(tokens, i, end);
      args.push(arg.node);
      i = arg.i;
      if (i < end && tokens[i].type === TOK_COMMA) i++;
    }
    if (i < end && tokens[i].type === TOK_RPAREN) i++;
    return { node: { type: 'func', name: name, args: args }, i: i };
  }
  // 未知 token，返回 0
  return { node: { type: 'num', value: 0 }, i: i + 1 };
}

/* ───────────────────────────────────────────────
 * Part 3: 求值器（带上下文解析）
 * ─────────────────────────────────────────────── */

/**
 * 求值 AST 节点
 * ctx: { getCell(sheet, col, row) → number|string, getRange(sheet, c1, r1, c2, r2) → number[][], currentSheet }
 */
function evalAST(node, ctx, currentSheet) {
  if (!node) return 0;
  switch (node.type) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'neg': return -evalAST(node.operand, ctx, currentSheet);
    case 'op': {
      var l = evalAST(node.left, ctx, currentSheet);
      var r = evalAST(node.right, ctx, currentSheet);
      l = (l == null ? 0 : Number(l)); r = (r == null ? 0 : Number(r));
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? 0 : (l / r);
        case '^': return Math.pow(l, r);
        case '&': return String(l) + String(r);
        default: return l;
      }
    }
    case 'comp': {
      var cl = evalAST(node.left, ctx, currentSheet);
      var cr = evalAST(node.right, ctx, currentSheet);
      cl = (cl == null ? 0 : Number(cl)); cr = (cr == null ? 0 : Number(cr));
      switch (node.op) {
        case '=': return cl === cr ? 1 : 0;
        case '<>': return cl !== cr ? 1 : 0;
        case '<': return cl < cr ? 1 : 0;
        case '>': return cl > cr ? 1 : 0;
        case '<=': return cl <= cr ? 1 : 0;
        case '>=': return cl >= cr ? 1 : 0;
        default: return 0;
      }
    }
    case 'ref': return resolveRef(node.value, ctx, currentSheet);
    case 'rangeRef': return resolveRange(node.start, node.end, ctx, currentSheet);
    case 'func': return evalFunc(node.name, node.args, ctx, currentSheet);
    default: return 0;
  }
}

function resolveRef(refStr, ctx, currentSheet) {
  var p = parseA1Ref(refStr);
  if (!p) return 0;
  var sheet = p.sheet || currentSheet;
  var v = ctx.getCell(sheet, p.col, p.row);
  return (v == null || v === '') ? 0 : (isNaN(Number(v)) ? v : Number(v));
}

function resolveRange(startRef, endRef, ctx, currentSheet) {
  var p1 = parseA1Ref(startRef);
  var p2 = parseA1Ref(endRef);
  if (!p1 || !p2) return [];
  var sheet = p1.sheet || currentSheet;
  var c1 = Math.min(p1.col, p2.col), c2 = Math.max(p1.col, p2.col);
  var r1 = Math.min(p1.row, p2.row), r2 = Math.max(p1.row, p2.row);
  return ctx.getRange(sheet, c1, r1, c2, r2);
}

function evalFunc(name, args, ctx, currentSheet) {
  var evaled = args.map(function(a) { return evalAST(a, ctx, currentSheet); });

  function toNumArr(x) {
    if (Array.isArray(x)) {
      var flat = []; x.forEach(function(row) { if (Array.isArray(row)) flat = flat.concat(row.map(Number)); else flat.push(Number(row)); });
      return flat.filter(function(v) { return !isNaN(v); });
    }
    return [Number(x) || 0];
  }

  switch (name) {
    case 'SUM': {
      var total = 0;
      args.forEach(function(a) {
        var v = evalAST(a, ctx, currentSheet);
        if (Array.isArray(v) && Array.isArray(v[0])) {
          v.forEach(function(row) { row.forEach(function(c) { total += Number(c) || 0; }); });
        } else if (Array.isArray(v)) {
          v.forEach(function(c) { total += Number(c) || 0; });
        } else {
          total += Number(v) || 0;
        }
      });
      return total;
    }
    case 'IF': {
      if (args.length < 2) return 0;
      var cond = evalAST(args[0], ctx, currentSheet);
      if (cond) return evalAST(args[1], ctx, currentSheet);
      return args.length >= 3 ? evalAST(args[2], ctx, currentSheet) : 0;
    }
    case 'MAX': {
      var nums = [];
      args.forEach(function(a) {
        var v = evalAST(a, ctx, currentSheet);
        if (Array.isArray(v)) nums = nums.concat(toNumArr(v));
        else nums.push(Number(v) || 0);
      });
      return nums.length === 0 ? 0 : Math.max.apply(null, nums);
    }
    case 'MIN': {
      var mins = [];
      args.forEach(function(a) {
        var v = evalAST(a, ctx, currentSheet);
        if (Array.isArray(v)) mins = mins.concat(toNumArr(v));
        else mins.push(Number(v) || 0);
      });
      return mins.length === 0 ? 0 : Math.min.apply(null, mins);
    }
    case 'AVERAGE': {
      var arr = [];
      args.forEach(function(a) {
        var v = evalAST(a, ctx, currentSheet);
        arr = arr.concat(toNumArr(v));
      });
      return arr.length === 0 ? 0 : arr.reduce(function(s, x) { return s + x; }, 0) / arr.length;
    }
    case 'ABS': return Math.abs(evaled[0] || 0);
    case 'ROUND': {
      var val = evaled[0] || 0;
      var dec = evaled.length >= 2 ? Math.round(evaled[1]) : 0;
      return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
    }
    case 'COUNT': {
      var cnt = 0;
      args.forEach(function(a) {
        var v = evalAST(a, ctx, currentSheet);
        if (Array.isArray(v)) cnt += toNumArr(v).length;
        else if (v != null && v !== '' && v !== 0) cnt++;
      });
      return cnt;
    }
    case 'SUMPRODUCT': {
      if (args.length < 2) return 0;
      var a1 = evalAST(args[0], ctx, currentSheet);
      var a2 = evalAST(args[1], ctx, currentSheet);
      var n1 = Array.isArray(a1) ? toNumArr(a1) : [Number(a1) || 0];
      var n2 = Array.isArray(a2) ? toNumArr(a2) : [Number(a2) || 0];
      var len = Math.min(n1.length, n2.length);
      var sp = 0;
      for (var si = 0; si < len; si++) sp += n1[si] * n2[si];
      return sp;
    }
    case 'EDATE': {
      if (args.length < 2) return '';
      var d = new Date(evaled[0]);
      if (isNaN(d.getTime())) return '';
      var months = Math.round(evaled[1]);
      d.setMonth(d.getMonth() + months);
      return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    }
    case 'XIRR': {
      // 简化 XIRR：使用牛顿法逼近
      if (args.length < 2) return 0;
      var vals = Array.isArray(evaled[0]) ? evaled[0] : [evaled[0]];
      var dates = Array.isArray(evaled[1]) ? evaled[1] : [evaled[1]];
      if (Array.isArray(vals) && Array.isArray(vals[0])) vals = vals[0]; // 展开二维
      if (Array.isArray(dates) && Array.isArray(dates[0])) dates = dates[0];
      return computeXIRR(vals, dates);
    }
    case 'NPV': {
      if (args.length < 2) return 0;
      var rate = evaled[0];
      var cf = args.slice(1).map(function(a) { return Number(evalAST(a, ctx, currentSheet)) || 0; });
      var npvVal = 0;
      for (var ni = 0; ni < cf.length; ni++) npvVal += cf[ni] / Math.pow(1 + rate, ni + 1);
      return npvVal;
    }
    default: return evaled[0] || 0;
  }
}

function computeXIRR(values, dates) {
  // 确保 values 和 dates 是同维数组
  var pairs = [];
  for (var i = 0; i < values.length; i++) {
    var v = Array.isArray(values[i]) ? Number(values[i][0]) : Number(values[i]);
    var d = Array.isArray(dates[i]) ? dates[i][0] : dates[i];
    if (isNaN(v)) continue;
    pairs.push({ v: v, d: new Date(d) });
  }
  if (pairs.length < 2) return 0;

  // 去掉前导 0
  while (pairs.length > 1 && pairs[0].v === 0) pairs.shift();
  if (pairs.length < 2) return 0;

  var t0 = pairs[0].d.getTime();
  // 使用 ms 差值 / 365.25天 计算年份
  var times = pairs.map(function(p) { return (p.d.getTime() - t0) / (365.25 * 24 * 3600 * 1000); });

  // 牛顿法
  var rate = 0.1;
  for (var iter = 0; iter < 100; iter++) {
    var f = 0, df = 0;
    for (var j = 0; j < pairs.length; j++) {
      var t = times[j];
      var exp = Math.pow(1 + rate, t);
      f += pairs[j].v / exp;
      if (t > 0.001) df -= t * pairs[j].v / (Math.pow(1 + rate, t + 1));
    }
    if (Math.abs(f) < 1e-6) break;
    if (Math.abs(df) < 1e-12) break;
    var newRate = rate - f / df;
    if (newRate < -0.99) rate = (rate - 0.99) / 2;
    else rate = newRate;
    if (Math.abs(f / df) < 1e-8) break;
  }
  return isNaN(rate) ? 0 : rate;
}

/* ───────────────────────────────────────────────
 * Part 4: Cell / Sheet / GridEngine
 * ─────────────────────────────────────────────── */

function createCell(rawValue) {
  return {
    raw: rawValue != null ? String(rawValue) : '',   // 用户输入（可能是 =公式 或纯文字/数字）
    formula: null,      // AST 节点（只有 = 开头才非 null）
    computed: null,     // 求值结果
    deps: [],           // [{sheet, col, row}] 此公式依赖的单元格
    dependents: [],     // [{sheet, col, row}] 依赖此单元格的其他单元格
    dirty: false,
    rendered: null      // 上次渲染时的 computed 缓存
  };
}

function createSheet(name, rows, cols) {
  return {
    name: name,
    rowCount: rows,
    colCount: cols,
    cells: {},          // sparse map: "!R{row}C{col}" → cell object
    rowHeaders: [],     // 行头标签
    colHeaders: [],     // 列头标签
    colWidths: {},      // 列宽覆盖
    defaultColWidth: 100,
    rowHeights: {},     // 行高覆盖
    defaultRowHeight: 32,
    frozenRows: 0,
    frozenCols: 0,
    mergedCells: []     // [{r1,c1,r2,c2}]
  };
}

function getCellKey(col, row) { return '!R' + row + 'C' + col; }

function createGridEngine() {
  var engine = {
    sheets: {},       // name → sheet
    sheetOrder: [],   // 表顺序
    ctx: null         // 求值上下文
  };

  engine.addSheet = function(name, rows, cols) {
    var sheet = createSheet(name, rows, cols);
    engine.sheets[name] = sheet;
    engine.sheetOrder.push(name);
    return sheet;
  };

  engine.getSheet = function(name) { return engine.sheets[name]; };

  engine.getCell = function(sheetName, col, row) {
    var sheet = engine.sheets[sheetName];
    if (!sheet) return null;
    var key = getCellKey(col, row);
    return sheet.cells[key] || null;
  };

  engine.getCellValue = function(sheetName, col, row) {
    var cell = engine.getCell(sheetName, col, row);
    if (!cell) return '';
    if (cell.computed != null) return cell.computed;
    // 非公式：解析 raw
    var raw = cell.raw;
    if (raw === '' || raw == null) return '';
    var n = Number(raw);
    return isNaN(n) ? raw : n;
  };

  /** 设置单元格内容：自动识别公式 vs 普通值 */
  engine.setCell = function(sheetName, col, row, rawValue) {
    var sheet = engine.sheets[sheetName];
    if (!sheet) return;
    var key = getCellKey(col, row);
    var cell = sheet.cells[key];
    if (!cell) { cell = createCell(rawValue); sheet.cells[key] = cell; }

    var raw = String(rawValue);
    cell.raw = raw;
    cell.dirty = true;

    if (raw.charAt(0) === '=' && raw.length > 1) {
      // 解析公式
      var tokens = tokenizeFormula(raw.slice(1));
      cell.formula = buildAST(tokens);
      // 提取依赖
      cell.deps = extractDeps(cell.formula, sheetName);
    } else {
      cell.formula = null;
      cell.deps = [];
      // 直接求值
      var n = Number(raw);
      cell.computed = (raw === '' || raw == null || isNaN(n)) ? raw : n;
      cell.dirty = false;
    }

    // 更新依赖关系
    engine.updateDependents(sheetName, col, row, cell);
    // 重算
    engine.recalc();
  };

  /** 批量设置、暂不重算 */
  engine.setCellRaw = function(sheetName, col, row, rawValue) {
    var sheet = engine.sheets[sheetName];
    if (!sheet) return;
    var key = getCellKey(col, row);
    var cell = sheet.cells[key];
    if (!cell) { cell = createCell(rawValue); sheet.cells[key] = cell; }
    cell.raw = String(rawValue);
    cell.formula = null;
    cell.computed = null;
    cell.dirty = true;
    cell.deps = [];
  };


  engine.updateDependents = function(sheetName, col, row, cell) {
    // 清除旧的反向依赖
    cell.deps.forEach(function(d) {
      var s = engine.sheets[d.sheet];
      if (!s) return;
      var c = s.cells[getCellKey(d.col, d.row)];
      if (!c) return;
      c.dependents = (c.dependents || []).filter(function(dep) {
        return !(dep.sheet === sheetName && dep.col === col && dep.row === row);
      });
    });
    // 建立新的反向依赖
    cell.deps.forEach(function(d) {
      var s = engine.sheets[d.sheet];
      if (!s) return;
      var c = s.cells[getCellKey(d.col, d.row)];
      if (!c) {
        c = createCell('');
        s.cells[getCellKey(d.col, d.row)] = c;
      }
      c.dependents = c.dependents || [];
      // 去重
      if (!c.dependents.some(function(dep) { return dep.sheet === sheetName && dep.col === col && dep.row === row; })) {
        c.dependents.push({ sheet: sheetName, col: col, row: row });
      }
    });
  };

  /** 拓扑重算 */
  engine.recalc = function() {
    var ctx = engine.makeEvalCtx();
    var visited = {};   // "sheet!RrCc" → true
    var computing = {}; // 循环检测

    var _marking = {};
    function markDirty(sheetName, col, row) {
      var ck = sheetName + '!R' + row + 'C' + col;
      if (_marking[ck]) return;
      _marking[ck] = true;
      var cell = engine.getCell(sheetName, col, row);
      if (!cell) return;
      if (cell.formula) cell.dirty = true;
      (cell.dependents || []).forEach(function(d) { markDirty(d.sheet, d.col, d.row); });
    }

    // 找到所有 dirty 的公式单元格，级联标记下游
    engine.sheetOrder.forEach(function(sn) {
      var sheet = engine.sheets[sn];
      Object.keys(sheet.cells).forEach(function(k) {
        var cell = sheet.cells[k];
        if (cell.formula && cell.dirty) {
          cell.dependents.forEach(function(d) { markDirty(d.sheet, d.col, d.row); });
        }
      });
    });

    // 求值所有 dirty 公式单元格
    function recalcCell(sheetName, col, row) {
      var cell = engine.getCell(sheetName, col, row);
      if (!cell || !cell.formula || !cell.dirty) return;
      var ck = sheetName + '!R' + row + 'C' + col;
      if (computing[ck]) { cell.computed = '#CIRCULAR!'; cell.dirty = false; return; }
      computing[ck] = true;
      // 先求值依赖
      cell.deps.forEach(function(d) { recalcCell(d.sheet, d.col, d.row); });
      cell.computed = evalAST(cell.formula, ctx, sheetName);
      cell.dirty = false;
      computing[ck] = false;
      visited[ck] = true;
    }

    engine.sheetOrder.forEach(function(sn) {
      var sheet = engine.sheets[sn];
      Object.keys(sheet.cells).forEach(function(k) {
        var cell = sheet.cells[k];
        if (cell.formula && cell.dirty) {
          var m = k.match(/!R(\d+)C(\d+)/);
          if (m) recalcCell(sn, parseInt(m[2]), parseInt(m[1]));
        }
      });
    });
  };

  /** 全部强制重算 */
  engine.recalcAll = function() {
    var ctx = engine.makeEvalCtx();
    engine.sheetOrder.forEach(function(sn) {
      var sheet = engine.sheets[sn];
      Object.keys(sheet.cells).forEach(function(k) {
        var cell = sheet.cells[k];
        if (cell.formula) {
          cell.computed = evalAST(cell.formula, ctx, sn);
        } else if (cell.dirty) {
          // 非公式直接计算
          var n = Number(cell.raw);
          cell.computed = (cell.raw === '' || cell.raw == null || isNaN(n)) ? cell.raw : n;
        }
        cell.dirty = false;
      });
    });
  };

  engine.makeEvalCtx = function() {
    return {
      getCell: function(sheet, col, row) {
        return engine.getCellValue(sheet, col, row);
      },
      getRange: function(sheet, c1, r1, c2, r2) {
        var arr = [];
        for (var r = r1; r <= r2; r++) {
          var row = [];
          for (var c = c1; c <= c2; c++) row.push(engine.getCellValue(sheet, c, r));
          arr.push(row);
        }
        return arr;
      }
    };
  };

  return engine;
}

/** 提取公式中所有单元格引用 */
function extractDeps(ast, currentSheet) {
  var deps = [];
  var seen = {};
  function walk(node) {
    if (!node) return;
    if (node.type === 'ref') {
      var p = parseA1Ref(node.value);
      if (p) {
        var sn = p.sheet || currentSheet;
        var k = sn + '!R' + p.row + 'C' + p.col;
        if (!seen[k]) { seen[k] = true; deps.push({ sheet: sn, col: p.col, row: p.row }); }
      }
    } else if (node.type === 'rangeRef') {
      var ps = parseA1Ref(node.start), pe = parseA1Ref(node.end);
      if (ps && pe) {
        var sn = ps.sheet || currentSheet;
        for (var c = Math.min(ps.col, pe.col); c <= Math.max(ps.col, pe.col); c++) {
          for (var r = Math.min(ps.row, pe.row); r <= Math.max(ps.row, pe.row); r++) {
            var k = sn + '!R' + r + 'C' + c;
            if (!seen[k]) { seen[k] = true; deps.push({ sheet: sn, col: c, row: r }); }
          }
        }
      }
    } else if (node.type === 'func') {
      node.args.forEach(function(a) { walk(a); });
    } else if (node.type === 'op' || node.type === 'comp') {
      walk(node.left); walk(node.right);
    } else if (node.type === 'neg') {
      walk(node.operand);
    }
  }
  walk(ast);
  return deps;
}

/* ───────────────────────────────────────────────
 * Part 5: 网格渲染器
 * ─────────────────────────────────────────────── */

/**
 * GridRenderer — 在容器内渲染可编辑电子表格
 *
 * 用法：
 *   var renderer = new GridRenderer(containerEl, engine, sheetName);
 *   renderer.render();
 *
 * 内置：
 *   - 虚拟滚动（只渲染可见区域 + 缓冲）
 *   - 单元格点击选中 / 双击编辑
 *   - 键盘导航（方向键 / Tab / Enter）
 *   - 公式栏
 *   - 复制粘贴
 *   - 列宽拖拽调整
 */
function GridRenderer(container, engine, sheetName) {
  this.container = container;
  this.engine = engine;
  this.sheetName = sheetName;
  this.sheet = engine.getSheet(sheetName);

  // 视口状态
  this.scrollLeft = 0;
  this.scrollTop = 0;
  this.viewWidth = 800;
  this.viewHeight = 600;

  // 选区
  this.selStart = null;  // {col, row} — 选区起点
  this.selEnd = null;    // {col, row} — 选区终点
  this.editCell = null;  // {col, row} — 正在编辑的格子

  // 缓存
  this._visibleCells = [];
  this._dom = {};
  this._built = false;
  this._raf = null;
}

GridRenderer.prototype = {

  /** 构建 DOM 结构 */
  build: function() {
    var self = this;
    var c = this.container;
    c.innerHTML = '';
    c.classList.add('ig-container');

    // 公式栏
    var fb = document.createElement('div');
    fb.className = 'ig-formula-bar';
    fb.innerHTML = '<span class="ig-cell-ref">A1</span>' +
      '<span class="ig-fx">fx</span>' +
      '<input class="ig-formula-input" id="ig-formula-input" placeholder="输入值或公式（=开头）">';
    c.appendChild(fb);
    this._dom.formulaBar = fb;
    this._dom.cellRef = fb.querySelector('.ig-cell-ref');
    this._dom.formulaInput = fb.querySelector('.ig-formula-input');

    // 表格区域
    var wrap = document.createElement('div');
    wrap.className = 'ig-scroll-wrap';
    c.appendChild(wrap);
    this._dom.wrap = wrap;

    // 列头
    var ch = document.createElement('div');
    ch.className = 'ig-col-headers';
    wrap.appendChild(ch);
    this._dom.colHeaders = ch;

    // 主画布
    var canvas = document.createElement('div');
    canvas.className = 'ig-canvas';
    canvas.style.position = 'relative';
    canvas.style.overflow = 'hidden';
    wrap.appendChild(canvas);
    this._dom.canvas = canvas;

    // 编辑浮层
    var overlay = document.createElement('input');
    overlay.className = 'ig-cell-editor';
    overlay.style.display = 'none';
    canvas.appendChild(overlay);
    this._dom.editor = overlay;

    // 选区高亮
    var sel = document.createElement('div');
    sel.className = 'ig-selection';
    sel.style.display = 'none';
    canvas.appendChild(sel);
    this._dom.selection = sel;

    // 滚动同步列头
    var syncScroll = function() {
      self.scrollLeft = wrap.scrollLeft;
      self.scrollTop = wrap.scrollTop;
      self._dom.colHeaders.scrollLeft = self.scrollLeft;
    };

    // 事件绑定
    wrap.addEventListener('scroll', function() {
      syncScroll();
      self.scheduleRender();
    });

    // 点击：选格子
    canvas.addEventListener('mousedown', function(e) {
      var cell = e.target.closest('.ig-cell');
      if (!cell) return;
      var cr = parseInt(cell.dataset.col), rr = parseInt(cell.dataset.row);
      self.selectCell(cr, rr, e.shiftKey);
      if (e.detail === 2) self.startEdit(cr, rr);
      e.preventDefault();
    });

    // 公式栏输入
    this._dom.formulaInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { self.commitEdit(); e.preventDefault(); }
      if (e.key === 'Escape') { self.cancelEdit(); e.preventDefault(); }
    });
    this._dom.formulaInput.addEventListener('blur', function() { self.commitEdit(); });

    // 编辑器事件
    this._dom.editor.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { self.commitEdit(); self.moveSelection(1, 0); e.preventDefault(); }
      if (e.key === 'Enter' && e.shiftKey) { self.commitEdit(); self.moveSelection(-1, 0); e.preventDefault(); }
      if (e.key === 'Tab') { self.commitEdit(); self.moveSelection(0, e.shiftKey ? -1 : 1); e.preventDefault(); }
      if (e.key === 'Escape') { self.cancelEdit(); e.preventDefault(); }
      if (e.key === 'F2') { /* 已是编辑模式，不做操作 */ e.preventDefault(); }
    });
    this._dom.editor.addEventListener('blur', function() { self.commitEdit(); });

    // 全局键盘
    document.addEventListener('keydown', function(e) {
      if (!self.container.contains(document.activeElement) && document.activeElement !== self._dom.formulaInput && document.activeElement !== self._dom.editor) return;
      if (e.target.tagName === 'INPUT' && e.target !== self._dom.formulaInput && e.target !== self._dom.editor) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') { e.preventDefault(); self.copySelection(); return; }
        if (e.key === 'v') { e.preventDefault(); self.pasteSelection(); return; }
        if (e.key === 'z') { e.preventDefault(); /* TODO undo */ return; }
        return;
      }
      if (self.editCell) return; // 编辑中由编辑器处理
      if (!self.selStart) return;
      var sr = self.selStart;
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); self.selectCell(sr.col, Math.max(0, sr.row - 1), e.shiftKey); break;
        case 'ArrowDown':  e.preventDefault(); self.selectCell(sr.col, Math.min(self.sheet.rowCount - 1, sr.row + 1), e.shiftKey); break;
        case 'ArrowLeft':  e.preventDefault(); self.selectCell(Math.max(0, sr.col - 1), sr.row, e.shiftKey); break;
        case 'ArrowRight': e.preventDefault(); self.selectCell(Math.min(self.sheet.colCount - 1, sr.col + 1), sr.row, e.shiftKey); break;
        case 'Tab':        e.preventDefault(); self.selectCell(Math.min(self.sheet.colCount - 1, sr.col + 1), sr.row, false); break;
        case 'Enter':      e.preventDefault(); self.startEdit(sr.col, sr.row); break;
        case 'F2':         e.preventDefault(); self.startEdit(sr.col, sr.row); break;
        case 'Delete':
        case 'Backspace':  e.preventDefault(); self.engine.setCell(self.sheetName, sr.col, sr.row, ''); self.render(); break;
      }
    });

    this._built = true;
    this.render();
  },

  /** 虚拟滚动渲染 */
  render: function() {
    if (!this._built) { this.build(); return; }
    var self = this;

    var DEFAULT_COL_W = this.sheet.defaultColWidth || 100;
    var ROW_H = this.sheet.defaultRowHeight || 32;
    var HEADER_H = 32;
    var ROW_HEADER_W = 50;
    var BUFFER_COLS = 4;
    var BUFFER_ROWS = 8;

    // 计算总宽/高
    var totalWidth = ROW_HEADER_W;
    var colOffsets = [ROW_HEADER_W]; // 每列左偏移
    for (var ci = 0; ci < this.sheet.colCount; ci++) {
      var cw = this.sheet.colWidths[ci] || DEFAULT_COL_W;
      totalWidth += cw;
      colOffsets.push(totalWidth);
    }
    var totalHeight = HEADER_H;
    var rowOffsets = [HEADER_H];
    for (var ri = 0; ri < this.sheet.rowCount; ri++) {
      var rh = this.sheet.rowHeights[ri] || ROW_H;
      totalHeight += rh;
      rowOffsets.push(totalHeight);
    }

    // 调整 canvas 大小
    var canvas = this._dom.canvas;
    canvas.style.width = totalWidth + 'px';
    canvas.style.height = totalHeight + 'px';

    // 可视范围
    var vw = this._dom.wrap.clientWidth;
    var vh = this._dom.wrap.clientHeight;
    var sl = this.scrollLeft, st = this.scrollTop;

    // 找可见列范围
    var firstCol = 0, lastCol = this.sheet.colCount - 1;
    for (ci = 0; ci < this.sheet.colCount; ci++) {
      if (colOffsets[ci + 1] > sl) { firstCol = Math.max(0, ci - BUFFER_COLS); break; }
    }
    for (ci = firstCol; ci < this.sheet.colCount; ci++) {
      if (colOffsets[ci] > sl + vw) { lastCol = Math.min(this.sheet.colCount - 1, ci + BUFFER_COLS); break; }
    }

    // 找可见行范围
    var firstRow = 0, lastRow = this.sheet.rowCount - 1;
    for (ri = 0; ri < this.sheet.rowCount; ri++) {
      if (rowOffsets[ri + 1] > st) { firstRow = Math.max(0, ri - BUFFER_ROWS); break; }
    }
    for (ri = firstRow; ri < this.sheet.rowCount; ri++) {
      if (rowOffsets[ri] > st + vh) { lastRow = Math.min(this.sheet.rowCount - 1, ri + BUFFER_ROWS); break; }
    }

    // 构建可见格子 HTML
    var html = '';

    // 行头 + 格子
    for (var r = firstRow; r <= lastRow; r++) {
      // 行头
      var rTop = rowOffsets[r];
      var rH = this.sheet.rowHeights[r] || ROW_H;
      var rowLabel = this.sheet.rowHeaders[r] || String(r + 1);
      html += '<div class="ig-row-header" style="position:absolute;left:0;top:' + rTop + 'px;width:' + ROW_HEADER_W + 'px;height:' + rH + 'px;line-height:' + rH + 'px">' + rowLabel + '</div>';

      for (var c = firstCol; c <= lastCol; c++) {
        var cLeft = colOffsets[c];
        var cW = this.sheet.colWidths[c] || DEFAULT_COL_W;
        var cell = this.engine.getCell(this.sheetName, c, r);
        var value = cell ? (cell.computed != null ? cell.computed : cell.raw) : '';
        var raw = cell ? cell.raw : '';

        // 格式化显示
        var display = '';
        var cls = 'ig-cell';
        if (cell && cell.formula) cls += ' ig-cell-formula';
        if (typeof value === 'number') {
          display = fmtNum(value);
          cls += ' ig-cell-num';
        } else {
          display = String(value != null ? value : '');
        }

        // 选区高亮
        if (this._isSelected(c, r)) cls += ' ig-cell-selected';
        if (this.editCell && this.editCell.col === c && this.editCell.row === r) cls += ' ig-cell-editing';

        html += '<div class="' + cls + '" data-col="' + c + '" data-row="' + r + '" ' +
          'style="position:absolute;left:' + cLeft + 'px;top:' + rTop + 'px;width:' + cW + 'px;height:' + rH + 'px;line-height:' + rH + 'px"' +
          ' title="' + escHtml(raw) + '">' +
          '<span class="ig-cell-text">' + escHtml(display) + '</span></div>';
      }
    }

    // 列头
    var chHTML = '';
    chHTML += '<div class="ig-col-header ig-corner-header" style="position:sticky;left:0;width:' + ROW_HEADER_W + 'px;height:' + HEADER_H + 'px;line-height:' + HEADER_H + 'px"></div>';
    for (c = firstCol; c <= lastCol; c++) {
      var cLabel = this.sheet.colHeaders[c] || colLetter(c);
      var cW = this.sheet.colWidths[c] || DEFAULT_COL_W;
      chHTML += '<div class="ig-col-header" style="position:absolute;left:' + colOffsets[c] + 'px;width:' + cW + 'px;height:' + HEADER_H + 'px;line-height:' + HEADER_H + 'px">' + cLabel + '</div>';
    }
    this._dom.colHeaders.innerHTML = chHTML;
    this._dom.colHeaders.style.width = totalWidth + 'px';
    this._dom.colHeaders.style.height = HEADER_H + 'px';

    canvas.innerHTML = html + (this._dom.editor ? '' : '');
    if (this._dom.editor) {
      canvas.appendChild(this._dom.editor);
      canvas.appendChild(this._dom.selection);
    }

    // 更新选区高亮
    this._updateSelection();
    // 更新公式栏
    this._updateFormulaBar();

    this._dom.colHeaders.scrollLeft = sl;
    if (this._dom.wrap.scrollLeft !== sl) this._dom.wrap.scrollLeft = sl;
    if (this._dom.wrap.scrollTop !== st) this._dom.wrap.scrollTop = st;
  },

  scheduleRender: function() {
    var self = this;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(function() { self.render(); });
  },

  /** 选区 */
  selectCell: function(col, row, extend) {
    if (!extend || !this.selStart) {
      this.selStart = { col: col, row: row };
      this.selEnd = { col: col, row: row };
    } else {
      this.selEnd = { col: col, row: row };
    }
    this.editCell = null;
    this._dom.editor.style.display = 'none';
    this.render();
  },

  moveSelection: function(dr, dc) {
    if (!this.selStart) return;
    var newCol = Math.max(0, Math.min(this.sheet.colCount - 1, this.selStart.col + dc));
    var newRow = Math.max(0, Math.min(this.sheet.rowCount - 1, this.selStart.row + dr));
    this.selectCell(newCol, newRow, false);
  },

  _isSelected: function(col, row) {
    if (!this.selStart) return false;
    var c1 = Math.min(this.selStart.col, (this.selEnd || this.selStart).col);
    var c2 = Math.max(this.selStart.col, (this.selEnd || this.selStart).col);
    var r1 = Math.min(this.selStart.row, (this.selEnd || this.selStart).row);
    var r2 = Math.max(this.selStart.row, (this.selEnd || this.selStart).row);
    return col >= c1 && col <= c2 && row >= r1 && row <= r2;
  },

  _updateSelection: function() {
    if (!this.selStart || !this._dom.selection) return;
    var c1 = Math.min(this.selStart.col, (this.selEnd || this.selStart).col);
    var c2 = Math.max(this.selStart.col, (this.selEnd || this.selStart).col);
    var r1 = Math.min(this.selStart.row, (this.selEnd || this.selStart).row);
    var r2 = Math.max(this.selStart.row, (this.selEnd || this.selStart).row);
    // 计算位置
    var DEFAULT_COL_W = this.sheet.defaultColWidth || 100;
    var ROW_H = this.sheet.defaultRowHeight || 32;
    var HEADER_H = 32;
    var ROW_HEADER_W = 50;
    var left = ROW_HEADER_W;
    for (var c = 0; c < c1; c++) left += this.sheet.colWidths[c] || DEFAULT_COL_W;
    var top = HEADER_H;
    for (var r = 0; r < r1; r++) top += this.sheet.rowHeights[r] || ROW_H;
    var w = 0;
    for (c = c1; c <= c2; c++) w += this.sheet.colWidths[c] || DEFAULT_COL_W;
    var h = 0;
    for (r = r1; r <= r2; r++) h += this.sheet.rowHeights[r] || ROW_H;

    var sel = this._dom.selection;
    sel.style.display = 'block';
    sel.style.left = left + 'px';
    sel.style.top = top + 'px';
    sel.style.width = w + 'px';
    sel.style.height = h + 'px';
  },

  _updateFormulaBar: function() {
    if (!this.selStart) return;
    var ref = colLetter(this.selStart.col) + (this.selStart.row + 1);
    this._dom.cellRef.textContent = ref;
    var cell = this.engine.getCell(this.sheetName, this.selStart.col, this.selStart.row);
    this._dom.formulaInput.value = cell ? cell.raw : '';
  },

  /** 编辑模式 */
  startEdit: function(col, row) {
    this.editCell = { col: col, row: row };
    this.selectCell(col, row, false);
    var cell = this.engine.getCell(this.sheetName, col, row);

    var DEFAULT_COL_W = this.sheet.defaultColWidth || 100;
    var ROW_H = this.sheet.defaultRowHeight || 32;
    var HEADER_H = 32;
    var ROW_HEADER_W = 50;
    var left = ROW_HEADER_W;
    for (var c = 0; c < col; c++) left += this.sheet.colWidths[c] || DEFAULT_COL_W;
    var top = HEADER_H;
    for (var r = 0; r < row; r++) top += this.sheet.rowHeights[r] || ROW_H;
    var cw = this.sheet.colWidths[col] || DEFAULT_COL_W;
    var rh = this.sheet.rowHeights[row] || ROW_H;

    var ed = this._dom.editor;
    ed.style.display = 'block';
    ed.style.left = left + 'px';
    ed.style.top = top + 'px';
    ed.style.width = cw + 'px';
    ed.style.height = rh + 'px';
    ed.value = cell ? cell.raw : '';
    ed.focus();
    if (ed.value) ed.select();
  },

  commitEdit: function() {
    if (!this.editCell) return;
    var val = this._dom.editor.value;
    this.engine.setCell(this.sheetName, this.editCell.col, this.editCell.row, val);
    this.editCell = null;
    this._dom.editor.style.display = 'none';
    this.scheduleRender();
  },

  cancelEdit: function() {
    this.editCell = null;
    this._dom.editor.style.display = 'none';
    this.scheduleRender();
  },

  /** 复制选区内容 */
  copySelection: function() {
    if (!this.selStart) return;
    var c1 = Math.min(this.selStart.col, (this.selEnd || this.selStart).col);
    var c2 = Math.max(this.selStart.col, (this.selEnd || this.selStart).col);
    var r1 = Math.min(this.selStart.row, (this.selEnd || this.selStart).row);
    var r2 = Math.max(this.selStart.row, (this.selEnd || this.selStart).row);
    var lines = [];
    for (var r = r1; r <= r2; r++) {
      var line = [];
      for (var c = c1; c <= c2; c++) {
        var cell = this.engine.getCell(this.sheetName, c, r);
        line.push(cell ? cell.raw : '');
      }
      lines.push(line.join('\t'));
    }
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() {});
    }
  },

  /** 粘贴到当前选区 */
  pasteSelection: function() {
    var self = this;
    if (!this.selStart) return;
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    navigator.clipboard.readText().then(function(text) {
      var rows = text.split(/\r?\n/);
      var startCol = self.selStart.col, startRow = self.selStart.row;
      var sheetName = self.sheetName;
      rows.forEach(function(line, ri) {
        var cols = line.split('\t');
        cols.forEach(function(val, ci) {
          self.engine.setCellRaw(sheetName, startCol + ci, startRow + ri, val);
        });
      });
      // 批量设置后，解析公式 + 重算
      self._parseAllFormulas();
      self.engine.recalcAll();
      self.scheduleRender();
    }).catch(function() {});
  },

  _parseAllFormulas: function() {
    var self = this;
    var sheet = this.sheet;
    // 先清除所有单元格的 dependents（准备重建依赖图）
    Object.keys(sheet.cells).forEach(function(k) {
      sheet.cells[k].dependents = [];
    });
    // 解析公式并提取依赖
    Object.keys(sheet.cells).forEach(function(k) {
      var cell = sheet.cells[k];
      var raw = cell.raw;
      if (raw && raw.charAt(0) === '=' && raw.length > 1) {
        var tokens = tokenizeFormula(raw.slice(1));
        cell.formula = buildAST(tokens);
        cell.deps = extractDeps(cell.formula, self.sheetName);
      } else {
        cell.formula = null;
        cell.deps = [];
      }
      cell.dirty = true;
    });
    // 重建所有依赖关系
    Object.keys(sheet.cells).forEach(function(k) {
      var cell = sheet.cells[k];
      if (cell.formula) {
        var m = k.match(/!R(\d+)C(\d+)/);
        if (m) self.engine.updateDependents(self.sheetName, parseInt(m[2]), parseInt(m[1]), cell);
      }
    });
  }
};

/* ───────────────────────────────────────────────
 * Part 6: 与投资测算模块的集成
 * ─────────────────────────────────────────────── */

/** 全局引擎实例 */
window._invEngine = null;
window._invRenderers = {};   // sheetName → GridRenderer

/** 初始化引擎 + 导入模板 */
window.initInvEngine = function() {
  if (window._invEngine) return window._invEngine;
  var engine = createGridEngine();
  window._invEngine = engine;

  // 创建 11 张表（名称必须与模板数据中的 sheet 名称一致）
  engine.addSheet('1、测算结果及敏感性分析', 75, 39);
  engine.addSheet('2、测算条件', 105, 23);
  engine.addSheet('3、成本分摊和利润汇总表', 66, 135);
  engine.addSheet('4、支付计划', 54, 106);
  engine.addSheet('5、销售计划及收入营业成本', 118, 73);
  engine.addSheet('6、自持运营表', 152, 18);
  engine.addSheet('7、土地增值税计算表 (2)', 33, 19);
  engine.addSheet('7、土地增值税计算表 (价值系数+建面分摊)', 28, 24);
  engine.addSheet('7、土地增值税计算表', 29, 19);
  engine.addSheet('8、项目现金流量表', 214, 236);
  engine.addSheet('9、利润表（核查表）', 44, 73);

  // 加载模板数据
  loadInvTemplates(engine);

  // Phase 1: 解析所有公式 + 建立依赖 + 非公式单元格直接求值
  engine.sheetOrder.forEach(function(sn) {
    var sheet = engine.getSheet(sn);
    Object.keys(sheet.cells).forEach(function(k) {
      var cell = sheet.cells[k];
      cell.dependents = [];
      var raw = cell.raw;
      if (raw && raw.charAt(0) === '=' && raw.length > 1) {
        var tokens = tokenizeFormula(raw.slice(1));
        cell.formula = buildAST(tokens);
        cell.deps = extractDeps(cell.formula, sn);
        cell.dirty = true;
      } else {
        cell.formula = null;
        cell.deps = [];
        // 非公式单元格直接求值
        var n = Number(raw);
        cell.computed = (raw === '' || raw == null || isNaN(n)) ? raw : n;
        cell.dirty = false;
      }
    });
  });
  // Phase 2: 建立所有依赖关系
  engine.sheetOrder.forEach(function(sn) {
    var sheet = engine.getSheet(sn);
    Object.keys(sheet.cells).forEach(function(k) {
      var cell = sheet.cells[k];
      if (cell.formula) {
        var m = k.match(/!R(\d+)C(\d+)/);
        if (m) engine.updateDependents(sn, parseInt(m[2]), parseInt(m[1]), cell);
      }
    });
  });

  // Phase 3: 拓扑重算所有公式（处理跨表引用顺序）
  engine.recalc();

  return engine;
};

/** 渲染测算编辑页——使用网格组件 */
window.renderInvGridEdit = function(sheetName) {
  if (!sheetName) sheetName = '2、测算条件';
  var main = document.getElementById('main-content');
  if (!main) return;

  var engine = window._invEngine;
  if (!engine) engine = window.initInvEngine();

  // 页面框架
  var html = '<div class="inv-calc-toolbar">' +
    '<div style="display:flex;align-items:center;gap:12px">' +
      '<button class="inv-back-btn" onclick="switchInvTab(\'inv_calc\')">&larr; 返回测算列表</button>' +
      '<button class="inv-btn" onclick="switchInvTab(\'inv_edit\')" title="切换回表单式编辑">表单编辑</button>' +
      '<span class="inv-calc-toolbar-title">投资测算模型</span>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="inv-btn inv-btn-primary" id="inv-grid-save" onclick="saveInvGridData()">保存数据</button>' +
    '</div>' +
  '</div>';

  // 表标签页
  html += '<div class="ig-sheet-tabs" id="ig-sheet-tabs">';
  engine.sheetOrder.forEach(function(sn, i) {
    var safeName = escHtml(sn);
    var jsSafe = sn.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    html += '<button class="ig-sheet-tab' + (sn === sheetName ? ' active' : '') + '" data-sheet="' + safeName + '" onclick="switchInvGridSheet(\'' + jsSafe + '\')" title="' + safeName + '">' + escHtml(sn.length > 10 ? sn.slice(0, 8) + '…' : sn) + '</button>';
  });
  html += '</div>';

  // 网格容器
  html += '<div class="ig-main-wrap" id="ig-main-wrap"></div>';

  main.innerHTML = html;

  // 渲染网格
  renderInvGridSheet(sheetName);
};

window.switchInvGridSheet = function(sheetName) {
  // 更新标签页状态
  document.querySelectorAll('.ig-sheet-tab').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-sheet') === sheetName);
  });
  renderInvGridSheet(sheetName);
};

function renderInvGridSheet(sheetName) {
  var container = document.getElementById('ig-main-wrap');
  if (!container) return;
  var engine = window._invEngine;
  if (!engine) return;

  // 设置合理的默认列宽
  var sheet = engine.getSheet(sheetName);
  if (sheet && sheet.colCount > 0 && Object.keys(sheet.colWidths).length === 0) {
    for (var c = 0; c < sheet.colCount; c++) {
      sheet.colWidths[c] = c === 0 ? 60 : 110;
    }
  }

  var renderer = new GridRenderer(container, engine, sheetName);
  window._invRenderers[sheetName] = renderer;
  renderer.build();
}

window.saveInvGridData = async function() {
  // 收集所有表的数据保存到 Supabase
  var engine = window._invEngine;
  if (!engine || !currentEditVersionId) return;

  try {
    // 序列化所有表数据
    var allData = {};
    engine.sheetOrder.forEach(function(sn) {
      var sheet = engine.getSheet(sn);
      var cells = {};
      Object.keys(sheet.cells).forEach(function(k) {
        var cell = sheet.cells[k];
        if (cell.raw !== '' && cell.raw != null) cells[k] = { raw: cell.raw };
      });
      allData[sn] = cells;
    });

    // 保存到 invest_input 表
    var dataStr = JSON.stringify(allData);
    // 用 section = 'grid_model' 存储完整模型
    await sb.from('invest_input').upsert({
      id: currentEditVersionId + '_grid_model',
      version_id: currentEditVersionId,
      section: 'grid_model',
      data: { model: allData }
    });
    invLogAction('保存测算模型', '保存完整测算模型数据');
    if (typeof toast === 'function') toast('测算模型保存成功', 'success');
  } catch (err) {
    console.error('保存失败:', err);
    if (typeof toast === 'function') toast('保存失败: ' + err.message, 'error');
  }
};

window.loadInvGridData = async function() {
  if (!currentEditVersionId) return;
  try {
    var engine = window._invEngine;
    if (!engine) engine = window.initInvEngine();

    var { data, error } = await sb.from('invest_input')
      .select('data')
      .eq('version_id', currentEditVersionId)
      .eq('section', 'grid_model')
      .maybeSingle();

    if (error || !data || !data.data || !data.data.model) return;

    var model = data.data.model;
    Object.keys(model).forEach(function(sn) {
      var sheet = engine.getSheet(sn);
      if (!sheet) return;
      var cells = model[sn];
      Object.keys(cells).forEach(function(k) {
        var cellData = cells[k];
        if (cellData.raw) {
          var m = k.match(/!R(\d+)C(\d+)/);
          if (m) engine.setCellRaw(sn, parseInt(m[2]), parseInt(m[1]), cellData.raw);
        }
      });
    });

    // 解析公式并重算
    engine.sheetOrder.forEach(function(sn) {
      var renderer = window._invRenderers[sn];
      if (renderer) renderer._parseAllFormulas();
    });
    engine.recalcAll();
    // 重新渲染当前表
    var activeTab = document.querySelector('.ig-sheet-tab.active');
    if (activeTab) {
      var sn = activeTab.getAttribute('data-sheet');
      if (sn) renderInvGridSheet(sn);
    }
  } catch (err) {
    console.error('加载失败:', err);
  }
};
