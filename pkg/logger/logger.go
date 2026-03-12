package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logger is a thin wrapper around zap.SugaredLogger.
type Logger interface {
	Info(args ...interface{})
	Infof(template string, args ...interface{})
	Warn(args ...interface{})
	Warnf(template string, args ...interface{})
	Error(args ...interface{})
	Errorf(template string, args ...interface{})
	Fatal(args ...interface{})
	Fatalf(template string, args ...interface{})
	Sync() error
}

type zapLogger struct {
	sugar *zap.SugaredLogger
}

// New constructs a Logger. In development, it uses a console-friendly encoder.
func New(env string) Logger {
	var cfg zap.Config
	if env == "production" {
		cfg = zap.NewProductionConfig()
	} else {
		cfg = zap.NewDevelopmentConfig()
		cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	base, err := cfg.Build()
	if err != nil {
		panic(err)
	}

	return &zapLogger{sugar: base.Sugar()}
}

func (l *zapLogger) Info(args ...interface{})                 { l.sugar.Info(args...) }
func (l *zapLogger) Infof(t string, args ...interface{})      { l.sugar.Infof(t, args...) }
func (l *zapLogger) Warn(args ...interface{})                 { l.sugar.Warn(args...) }
func (l *zapLogger) Warnf(t string, args ...interface{})      { l.sugar.Warnf(t, args...) }
func (l *zapLogger) Error(args ...interface{})                { l.sugar.Error(args...) }
func (l *zapLogger) Errorf(t string, args ...interface{})     { l.sugar.Errorf(t, args...) }
func (l *zapLogger) Fatal(args ...interface{})                { l.sugar.Fatal(args...) }
func (l *zapLogger) Fatalf(t string, args ...interface{})     { l.sugar.Fatalf(t, args...) }
func (l *zapLogger) Sync() error                              { return l.sugar.Sync() }
