// Reads a quiz bank written as a TypeScript object literal by walking its syntax tree — the file is never run.
const fs = require('fs');
const ts = require('typescript');
const file = ts.createSourceFile('x.ts', fs.readFileSync(process.argv[2], 'utf8'), ts.ScriptTarget.Latest, true);
function val(n) {
  switch (n.kind) {
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const o = {};
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) throw new Error('unsupported property at ' + p.getStart());
        o[p.name.text ?? p.name.getText()] = val(p.initializer);
      }
      return o;
    }
    case ts.SyntaxKind.ArrayLiteralExpression: return n.elements.map(val);
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral: return n.text;
    case ts.SyntaxKind.NumericLiteral: return Number(n.text);
    case ts.SyntaxKind.TrueKeyword: return true;
    case ts.SyntaxKind.FalseKeyword: return false;
    case ts.SyntaxKind.NullKeyword: return null;
    case ts.SyntaxKind.PrefixUnaryExpression: return -val(n.operand);
    case ts.SyntaxKind.ParenthesizedExpression: return val(n.expression);
    case ts.SyntaxKind.AsExpression: case ts.SyntaxKind.SatisfiesExpression: return val(n.expression);
    case ts.SyntaxKind.BinaryExpression:
      if (n.operatorToken.kind === ts.SyntaxKind.PlusToken) return val(n.left) + val(n.right);
    default: throw new Error('unsupported ' + ts.SyntaxKind[n.kind] + ' at line ' + (file.getLineAndCharacterOfPosition(n.getStart()).line + 1));
  }
}
let found = null;
ts.forEachChild(file, function walk(n) {
  if (!found && ts.isVariableDeclaration(n) && n.initializer && ts.isObjectLiteralExpression(n.initializer)) found = n.initializer;
  else ts.forEachChild(n, walk);
});
const obj = val(found);
fs.writeFileSync(process.argv[3], JSON.stringify(obj, null, 1));
console.log('keys', Object.keys(obj), 'questions', obj.questions.length);
