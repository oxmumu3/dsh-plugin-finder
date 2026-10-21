PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS collector_limits(name TEXT PRIMARY KEY,value INTEGER NOT NULL CHECK(value>0));
INSERT OR IGNORE INTO collector_limits VALUES ('register_global_daily',100),('register_ip_daily',5),('installations',2000),('events_global_daily',5000),('events_installation_daily',500),('retained_events',50000),('retained_bytes',104857600);
CREATE TABLE IF NOT EXISTS daily_usage(day TEXT NOT NULL,kind TEXT NOT NULL,bucket TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,kind,bucket));
CREATE TABLE IF NOT EXISTS collector_totals(id INTEGER PRIMARY KEY CHECK(id=1),event_count INTEGER NOT NULL,total_bytes INTEGER NOT NULL);
INSERT OR IGNORE INTO collector_totals VALUES(1,0,0);
CREATE TABLE IF NOT EXISTS installations(id TEXT PRIMARY KEY,upload_hash TEXT NOT NULL UNIQUE,delete_hash TEXT NOT NULL UNIQUE,consented_at TEXT NOT NULL,client_version TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment IN ('production','test')),created_at TEXT NOT NULL,registration_day TEXT NOT NULL,ip_bucket TEXT NOT NULL,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY,installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,type TEXT NOT NULL,task_id TEXT NOT NULL,revision_id TEXT NOT NULL,occurred_at TEXT NOT NULL,received_at TEXT NOT NULL,day TEXT NOT NULL,payload TEXT NOT NULL,size_bytes INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_installation ON events(installation_id);
CREATE INDEX IF NOT EXISTS events_received ON events(received_at);
CREATE INDEX IF NOT EXISTS events_task ON events(installation_id,task_id);
CREATE TRIGGER IF NOT EXISTS installations_quota BEFORE INSERT ON installations BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM installations)>=(SELECT value FROM collector_limits WHERE name='installations') THEN RAISE(ABORT,'COLLECTOR_QUOTA') END;
 SELECT CASE WHEN COALESCE((SELECT used FROM daily_usage WHERE day=NEW.registration_day AND kind='register' AND bucket='global'),0)>=(SELECT value FROM collector_limits WHERE name='register_global_daily') THEN RAISE(ABORT,'COLLECTOR_QUOTA') END;
 SELECT CASE WHEN COALESCE((SELECT used FROM daily_usage WHERE day=NEW.registration_day AND kind='register' AND bucket=NEW.ip_bucket),0)>=(SELECT value FROM collector_limits WHERE name='register_ip_daily') THEN RAISE(ABORT,'COLLECTOR_QUOTA') END;
END;
CREATE TRIGGER IF NOT EXISTS installations_count AFTER INSERT ON installations BEGIN
 INSERT INTO daily_usage VALUES(NEW.registration_day,'register','global',1) ON CONFLICT(day,kind,bucket) DO UPDATE SET used=used+1;
 INSERT INTO daily_usage VALUES(NEW.registration_day,'register',NEW.ip_bucket,1) ON CONFLICT(day,kind,bucket) DO UPDATE SET used=used+1;
END;
CREATE TRIGGER IF NOT EXISTS events_quota BEFORE INSERT ON events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM installations WHERE id=NEW.installation_id AND revoked_at IS NULL) THEN RAISE(ABORT,'COLLECTOR_REVOKED') END;
 SELECT CASE WHEN COALESCE((SELECT used FROM daily_usage WHERE day=NEW.day AND kind='events' AND bucket='global'),0)>=(SELECT value FROM collector_limits WHERE name='events_global_daily') THEN RAISE(ABORT,'COLLECTOR_QUOTA') END;
 SELECT CASE WHEN COALESCE((SELECT used FROM daily_usage WHERE day=NEW.day AND kind='events' AND bucket=NEW.installation_id),0)>=(SELECT value FROM collector_limits WHERE name='events_installation_daily') THEN RAISE(ABORT,'COLLECTOR_QUOTA') END;
 SELECT CASE WHEN (SELECT event_count FROM collector_totals WHERE id=1)>=(SELECT value FROM collector_limits WHERE name='retained_events') OR (SELECT total_bytes FROM collector_totals WHERE id=1)+NEW.size_bytes>(SELECT value FROM collector_limits WHERE name='retained_bytes') THEN RAISE(ABORT,'COLLECTOR_QUOTA') END;
END;
CREATE TRIGGER IF NOT EXISTS events_count AFTER INSERT ON events BEGIN
 UPDATE collector_totals SET event_count=event_count+1,total_bytes=total_bytes+NEW.size_bytes WHERE id=1;
 INSERT INTO daily_usage VALUES(NEW.day,'events','global',1) ON CONFLICT(day,kind,bucket) DO UPDATE SET used=used+1;
 INSERT INTO daily_usage VALUES(NEW.day,'events',NEW.installation_id,1) ON CONFLICT(day,kind,bucket) DO UPDATE SET used=used+1;
END;
CREATE TRIGGER IF NOT EXISTS events_delete AFTER DELETE ON events BEGIN
 UPDATE collector_totals SET event_count=event_count-1,total_bytes=total_bytes-OLD.size_bytes WHERE id=1;
END;
