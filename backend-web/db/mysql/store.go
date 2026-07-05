package mysql

import (
	"database/sql"

	"lingxi-core/store"
)

// MySQLStore Web 多租户 Store 实现。
type MySQLStore struct {
	db *sql.DB
}

var _ store.Store = (*MySQLStore)(nil)

func New(db *sql.DB) *MySQLStore {
	return &MySQLStore{db: db}
}
