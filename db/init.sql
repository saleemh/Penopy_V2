CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    host_id VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS strokes (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(50) NOT NULL,
    stroke_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(50) NOT NULL,
    user_name VARCHAR(10) NOT NULL,
    color VARCHAR(7),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);