use onecapture_lib::annotation::{
    AnnotationHistory, AnnotationItem, ArrowAnnotation, Point2D, RectAnnotation, StrokeAnnotation,
};

#[test]
fn test_arrow_head_calculation() {
    let arrow = ArrowAnnotation {
        start: Point2D::new(0.0, 0.0),
        end: Point2D::new(100.0, 0.0), // pointing along +X
        color: "#f43f5e".to_string(),
        stroke_width: 2.0,
    };

    let (left, right) = arrow.calculate_arrow_head(10.0, std::f32::consts::PI / 6.0);

    // Left wing and right wing should span above and below the arrow shaft (y=0)
    assert!(left.x < 100.0);
    assert!(right.x < 100.0);
    assert!((left.y - 5.0).abs() < 1e-4);
    assert!((right.y - (-5.0)).abs() < 1e-4);
}

#[test]
fn test_stroke_hit_test_eraser() {
    let stroke = StrokeAnnotation {
        points: vec![
            Point2D::new(10.0, 10.0),
            Point2D::new(20.0, 20.0),
            Point2D::new(30.0, 30.0),
        ],
        color: "#38bdf8".to_string(),
        stroke_width: 4.0,
    };

    // Close point should hit
    assert!(stroke.hit_test(&Point2D::new(21.0, 21.0), 5.0));

    // Distant point should miss
    assert!(!stroke.hit_test(&Point2D::new(100.0, 100.0), 5.0));
}

#[test]
fn test_history_undo_redo_and_erase() {
    let mut history = AnnotationHistory::new();
    let rect = AnnotationItem::Rect(RectAnnotation {
        x: 50.0,
        y: 50.0,
        width: 100.0,
        height: 100.0,
        color: "#10b981".to_string(),
        stroke_width: 2.0,
    });

    history.push(rect);
    assert_eq!(history.items().len(), 1);

    // Undo
    let popped = history.undo();
    assert!(popped.is_some());
    assert_eq!(history.items().len(), 0);

    // Redo
    let restored = history.redo();
    assert!(restored.is_some());
    assert_eq!(history.items().len(), 1);

    // Erase collision
    let erased_count = history.erase_at(&Point2D::new(75.0, 75.0), 10.0);
    assert_eq!(erased_count, 1);
    assert_eq!(history.items().len(), 0);
}
