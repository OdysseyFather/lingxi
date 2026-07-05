// lint-tenant 检查 Web 多租户隔离红线：handler/core 禁止 db.DB 直调。
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	targets := []string{
		filepath.Join(root, "backend-web/handler"),
		filepath.Join(root, "backend-core"),
	}
	var violations []string
	for _, dir := range targets {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue
		}
		_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			fset := token.NewFileSet()
			f, err := parser.ParseFile(fset, path, nil, 0)
			if err != nil {
				return nil
			}
			ast.Inspect(f, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				id, ok := sel.X.(*ast.Ident)
				if ok && id.Name == "db" && (sel.Sel.Name == "DB" || sel.Sel.Name == "Query" || sel.Sel.Name == "Exec") {
					pos := fset.Position(call.Pos())
					violations = append(violations, fmt.Sprintf("%s:%d db.%s 直调", path, pos.Line, sel.Sel.Name))
				}
				return true
			})
			return nil
		})
	}
	if len(violations) > 0 {
		fmt.Println("tenant linter FAILED:")
		for _, v := range violations {
			fmt.Println(" ", v)
		}
		os.Exit(1)
	}
	fmt.Println("tenant linter OK")
}
