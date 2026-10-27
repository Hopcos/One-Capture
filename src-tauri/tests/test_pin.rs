use onecapture_lib::pin::PinManager;

#[test]
fn test_pin_creation_and_retrieval() {
    let manager = PinManager::new();
    let pin = manager.create_pin("data:image/png;base64,test".to_string(), 100, 200, 400, 300);

    assert!(pin.id.starts_with("pin-"));
    assert_eq!(pin.x, 100);
    assert_eq!(pin.y, 200);
    assert_eq!(pin.width, 400);
    assert_eq!(pin.height, 300);
    assert_eq!(pin.scale, 1.0);
    assert_eq!(pin.opacity, 1.0);

    let fetched = manager.get_pin(&pin.id);
    assert!(fetched.is_some());
    assert_eq!(fetched.unwrap().id, pin.id);
}

#[test]
fn test_pin_scale_clamping() {
    let manager = PinManager::new();
    let pin = manager.create_pin("data:image/png;base64,test".to_string(), 0, 0, 100, 100);

    // Zoom in beyond 5.0x
    let new_scale = manager.update_scale(&pin.id, 10.0);
    assert_eq!(new_scale, Some(5.0)); // Clamped to 5.0

    // Zoom out below 0.2x
    let small_scale = manager.update_scale(&pin.id, 0.01);
    assert_eq!(small_scale, Some(0.2)); // Clamped to 0.2
}

#[test]
fn test_pin_opacity_clamping() {
    let manager = PinManager::new();
    let pin = manager.create_pin("data:image/png;base64,test".to_string(), 0, 0, 100, 100);

    let op = manager.update_opacity(&pin.id, 0.05);
    assert_eq!(op, Some(0.1)); // Min 0.1

    let op2 = manager.update_opacity(&pin.id, 1.5);
    assert_eq!(op2, Some(1.0)); // Max 1.0
}

#[test]
fn test_pin_removal() {
    let manager = PinManager::new();
    let pin1 = manager.create_pin("data:test1".to_string(), 0, 0, 50, 50);
    let _pin2 = manager.create_pin("data:test2".to_string(), 10, 10, 50, 50);

    assert_eq!(manager.list_pins().len(), 2);

    assert!(manager.remove_pin(&pin1.id));
    assert_eq!(manager.list_pins().len(), 1);

    manager.clear_all();
    assert_eq!(manager.list_pins().len(), 0);
}
