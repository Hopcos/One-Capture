pub mod encoder;
pub mod pipeline;
pub mod timer;

pub use encoder::{
    find_ffmpeg_binary, AudioFormat, AudioRecordOptions, VideoCodec, VideoFormat,
    VideoRecordOptions,
};
pub use pipeline::{ActiveRecording, RecorderPipeline};
pub use timer::{RecordingStatus, RecordingTimer};
