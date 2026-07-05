package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"lingxi-core/store"
)

const mysqlSkillCols = `id, user_id, name, description, file_path, installed, source, marketplace_id, marketplace_version, author, created_at, updated_at`

func (s *MySQLStore) ListSkills(ctx context.Context, userID int64) ([]store.Skill, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+mysqlSkillCols+` FROM skills
		WHERE user_id=? OR user_id=0 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMySQLSkills(rows)
}

func scanMySQLSkills(rows *sql.Rows) ([]store.Skill, error) {
	out := make([]store.Skill, 0)
	for rows.Next() {
		sk, err := scanMySQLSkillRow(rows)
		if err != nil {
			continue
		}
		out = append(out, sk)
	}
	return out, rows.Err()
}

func scanMySQLSkillRow(scanner interface {
	Scan(dest ...any) error
}) (store.Skill, error) {
	var sk store.Skill
	var installed int
	err := scanner.Scan(&sk.ID, &sk.UserID, &sk.Name, &sk.Description, &sk.FilePath, &installed,
		&sk.Source, &sk.MarketplaceID, &sk.MarketplaceVersion, &sk.Author, &sk.CreatedAt, &sk.UpdatedAt)
	if err != nil {
		return sk, err
	}
	sk.Installed = installed == 1
	return sk, nil
}

func (s *MySQLStore) GetSkill(ctx context.Context, userID, skillID int64) (*store.Skill, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT `+mysqlSkillCols+` FROM skills WHERE id=? AND (user_id=? OR user_id=0)`, skillID, userID)
	sk, err := scanMySQLSkillRow(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("skill not found")
	}
	if err != nil {
		return nil, err
	}
	return &sk, nil
}

func (s *MySQLStore) GetSkillByName(ctx context.Context, userID int64, name string) (*store.Skill, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT `+mysqlSkillCols+` FROM skills WHERE name=? AND (user_id=? OR user_id=0)`, name, userID)
	sk, err := scanMySQLSkillRow(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("skill not found")
	}
	if err != nil {
		return nil, err
	}
	return &sk, nil
}

func (s *MySQLStore) InsertSkill(ctx context.Context, userID int64, sk *store.Skill) (int64, error) {
	installed := 0
	if sk.Installed {
		installed = 1
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO skills (user_id, name, description, file_path, installed, source, marketplace_id, marketplace_version, author)
		VALUES (?,?,?,?,?,?,?,?,?)`,
		userID, sk.Name, sk.Description, sk.FilePath, installed, sk.Source, sk.MarketplaceID, sk.MarketplaceVersion, sk.Author)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *MySQLStore) UpdateSkill(ctx context.Context, userID int64, sk *store.Skill) error {
	installed := 0
	if sk.Installed {
		installed = 1
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE skills SET name=?, description=?, file_path=?, installed=?, source=?,
		marketplace_id=?, marketplace_version=?, author=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=? AND user_id=?`,
		sk.Name, sk.Description, sk.FilePath, installed, sk.Source,
		sk.MarketplaceID, sk.MarketplaceVersion, sk.Author, sk.ID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("skill not found")
	}
	return nil
}

func (s *MySQLStore) SetSkillInstalled(ctx context.Context, userID, skillID int64, installed bool) error {
	v := 0
	if installed {
		v = 1
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE skills SET installed=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=? AND (user_id=? OR user_id=0)`, v, skillID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("skill not found")
	}
	return nil
}

func (s *MySQLStore) DeleteSkill(ctx context.Context, userID, skillID int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM skills WHERE id=? AND user_id=?`, skillID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("skill not found")
	}
	return nil
}

func (s *MySQLStore) ListInstalledSkillPaths(ctx context.Context, userID int64) ([]store.SkillPath, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT name, file_path FROM skills WHERE installed=1 AND (user_id=? OR user_id=0)`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]store.SkillPath, 0)
	for rows.Next() {
		var p store.SkillPath
		if err := rows.Scan(&p.Name, &p.FilePath); err != nil {
			continue
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
