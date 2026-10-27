use std::thread::sleep;
use std::time::Duration;
use onecapture_lib::recorder::timer::{RecordingStatus, RecordingTimer};

#[test]
fn test_timer_initial_idle() {
    let timer = RecordingTimer::new(None);
    assert_eq!(timer.status(), RecordingStatus::Idle);
    assert_eq!(timer.elapsed(), Duration::ZERO);
    assert_eq!(timer.format_duration(), "00:00");
}

#[test]
fn test_timer_start_and_elapsed() {
    let mut timer = RecordingTimer::new(None);
    timer.start();
    assert_eq!(timer.status(), RecordingStatus::Recording);

    sleep(Duration::from_millis(50));
    assert!(timer.elapsed() >= Duration::from_millis(40));
}

#[test]
fn test_timer_pause_and_resume() {
    let mut timer = RecordingTimer::new(None);
    timer.start();
    sleep(Duration::from_millis(30));

    timer.pause();
    assert_eq!(timer.status(), RecordingStatus::Paused);
    let paused_elapsed = timer.elapsed();

    // Sleep during pause - elapsed should not advance significantly
    sleep(Duration::from_millis(50));
    let during_pause = timer.elapsed();
    assert!((during_pause.as_millis() as i64 - paused_elapsed.as_millis() as i64).abs() < 10);

    timer.resume();
    assert_eq!(timer.status(), RecordingStatus::Recording);
    sleep(Duration::from_millis(30));
    assert!(timer.elapsed() > paused_elapsed);
}

#[test]
fn test_timer_time_limit_reached() {
    let mut timer = RecordingTimer::new(Some(1)); // 1 second limit
    timer.start();
    assert!(!timer.is_time_limit_reached());

    sleep(Duration::from_millis(1050));
    assert!(timer.is_time_limit_reached());
}
