use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordingStatus {
    Idle,
    Recording,
    Paused,
    Stopped,
}

/// Accurate timer for tracking recording durations, pause intervals, and time limits
pub struct RecordingTimer {
    status: RecordingStatus,
    start_time: Option<Instant>,
    pause_start: Option<Instant>,
    total_paused: Duration,
    time_limit: Option<Duration>,
}

impl RecordingTimer {
    pub fn new(time_limit_secs: Option<u64>) -> Self {
        Self {
            status: RecordingStatus::Idle,
            start_time: None,
            pause_start: None,
            total_paused: Duration::ZERO,
            time_limit: time_limit_secs.map(Duration::from_secs),
        }
    }

    pub fn start(&mut self) {
        self.status = RecordingStatus::Recording;
        self.start_time = Some(Instant::now());
        self.pause_start = None;
        self.total_paused = Duration::ZERO;
    }

    pub fn pause(&mut self) {
        if self.status == RecordingStatus::Recording {
            self.status = RecordingStatus::Paused;
            self.pause_start = Some(Instant::now());
        }
    }

    pub fn resume(&mut self) {
        if self.status == RecordingStatus::Paused {
            if let Some(p_start) = self.pause_start.take() {
                self.total_paused += p_start.elapsed();
            }
            self.status = RecordingStatus::Recording;
        }
    }

    pub fn stop(&mut self) -> Duration {
        let final_duration = self.elapsed();
        self.status = RecordingStatus::Stopped;
        final_duration
    }

    pub fn status(&self) -> RecordingStatus {
        self.status
    }

    /// Calculate active recording duration excluding all paused intervals
    pub fn elapsed(&self) -> Duration {
        match (self.status, self.start_time) {
            (RecordingStatus::Idle, _) => Duration::ZERO,
            (RecordingStatus::Recording, Some(start)) => {
                let total = start.elapsed();
                total.saturating_sub(self.total_paused)
            }
            (RecordingStatus::Paused, Some(start)) => {
                let current_pause = self.pause_start.map(|p| p.elapsed()).unwrap_or(Duration::ZERO);
                let total = start.elapsed();
                total.saturating_sub(self.total_paused + current_pause)
            }
            (RecordingStatus::Stopped, Some(start)) => {
                let total = start.elapsed();
                total.saturating_sub(self.total_paused)
            }
            _ => Duration::ZERO,
        }
    }

    /// Check if recording has exceeded its specified time window limit
    pub fn is_time_limit_reached(&self) -> bool {
        if let Some(limit) = self.time_limit {
            self.elapsed() >= limit
        } else {
            false
        }
    }

    /// Format active duration as HH:MM:SS
    pub fn format_duration(&self) -> String {
        let secs = self.elapsed().as_secs();
        let hours = secs / 3600;
        let mins = (secs % 3600) / 60;
        let remaining_secs = secs % 60;

        if hours > 0 {
            format!("{:02}:{:02}:{:02}", hours, mins, remaining_secs)
        } else {
            format!("{:02}:{:02}", mins, remaining_secs)
        }
    }
}
