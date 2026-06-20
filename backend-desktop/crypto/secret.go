package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"runtime"
	"strings"
	"sync"

	"golang.org/x/crypto/hkdf"
)

const encPrefix = "enc:v1:"

var (
	derivedKey     []byte
	derivedKeyOnce sync.Once
	derivedKeyErr  error
)

func getOrDeriveKey() ([]byte, error) {
	derivedKeyOnce.Do(func() {
		machineID, err := getMachineID()
		if err != nil {
			derivedKeyErr = fmt.Errorf("failed to get machine ID: %w", err)
			return
		}

		hkdfReader := hkdf.New(sha256.New, []byte(machineID), []byte("lingxi-agent-v1-salt"), []byte("lingxi-secret-encryption"))
		key := make([]byte, 32)
		if _, err := io.ReadFull(hkdfReader, key); err != nil {
			derivedKeyErr = fmt.Errorf("HKDF key derivation failed: %w", err)
			return
		}
		derivedKey = key
	})
	return derivedKey, derivedKeyErr
}

func getMachineID() (string, error) {
	switch runtime.GOOS {
	case "darwin":
		out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
		if err != nil {
			return "", err
		}
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "IOPlatformUUID") {
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					id := strings.TrimSpace(parts[1])
					id = strings.Trim(id, "\"")
					if id != "" {
						return id, nil
					}
				}
			}
		}
		return "", fmt.Errorf("IOPlatformUUID not found")

	case "windows":
		out, err := exec.Command("reg", "query",
			`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
			"/v", "MachineGuid").Output()
		if err != nil {
			return "", err
		}
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "MachineGuid") {
				fields := strings.Fields(line)
				if len(fields) >= 3 {
					return fields[len(fields)-1], nil
				}
			}
		}
		return "", fmt.Errorf("MachineGuid not found")

	default:
		return "", fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

// Encrypt 使用 AES-256-GCM 加密明文，返回带 enc:v1: 前缀的密文。
// 空字符串直接返回空字符串（不加密）。
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	key, err := getOrDeriveKey()
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt 解密存储的密文。
// 如果没有 enc:v1: 前缀，视为旧版明文直接返回（兼容迁移期）。
// 解密失败时返回空字符串 + error（不 panic），调用方应据此提示用户重新配置。
func Decrypt(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	if !strings.HasPrefix(stored, encPrefix) {
		return stored, nil
	}

	key, err := getOrDeriveKey()
	if err != nil {
		slog.Warn("[crypto] key derivation failed, secret may need reconfiguration", "err", err)
		return "", err
	}

	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, encPrefix))
	if err != nil {
		slog.Warn("[crypto] base64 decode failed", "err", err)
		return "", fmt.Errorf("密钥已失效，请重新配置")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("密钥已失效，请重新配置")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		slog.Warn("[crypto] AES-GCM decrypt failed (machine ID changed?)", "err", err)
		return "", fmt.Errorf("密钥已失效，请重新配置")
	}

	return string(plaintext), nil
}

// IsEncrypted 检查字符串是否已加密
func IsEncrypted(s string) bool {
	return strings.HasPrefix(s, encPrefix)
}
