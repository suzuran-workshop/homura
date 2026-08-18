package redis

import (
	"context"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var Client *redis.Client

func InitClient() error {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	password := os.Getenv("REDIS_PASSWORD")

	c := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := c.Ping(ctx).Err(); err != nil {
		// Keep Client nil so in-memory fallbacks activate everywhere.
		Client = nil
		return err
	}

	Client = c
	return nil
}

func Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return Client.Set(ctx, key, value, expiration).Err()
}

func Get(ctx context.Context, key string) *redis.StringCmd {
	return Client.Get(ctx, key)
}

func Delete(ctx context.Context, key string) error {
	return Client.Del(ctx, key).Err()
}
