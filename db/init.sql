CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    host_id VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS strokes (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(255) NOT NULL,
    stroke_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES sessions(room_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    color VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES sessions(room_id)
);

-- Add indexes for better query performance
CREATE INDEX idx_strokes_room_id ON strokes(room_id);
CREATE INDEX idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX idx_strokes_created_at ON strokes(created_at);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);