package handler

import (
	"os"

	"github.com/google/uuid"
)

// osStat 包一层便于测试
func osStat(path string) (os.FileInfo, error) {
	return os.Stat(path)
}

func generateID() string {
	return uuid.NewString()
}
