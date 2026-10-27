use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinItem {
    pub id: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f32,       // 0.2 to 5.0
    pub opacity: f32,     // 0.1 to 1.0
    pub is_locked: bool,  // click-through
    pub image_data_url: String,
}

#[derive(Clone)]
pub struct PinManager {
    pins: Arc<Mutex<HashMap<String, PinItem>>>,
}

impl PinManager {
    pub fn new() -> Self {
        Self {
            pins: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create and register a new pinned screenshot
    pub fn create_pin(
        &self,
        image_data_url: String,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> PinItem {
        let id = format!("pin-{}", Uuid::new_v4());
        let item = PinItem {
            id: id.clone(),
            title: format!("Pin ({})", &id[4..8]),
            x,
            y,
            width,
            height,
            scale: 1.0,
            opacity: 1.0,
            is_locked: false,
            image_data_url,
        };

        if let Ok(mut map) = self.pins.lock() {
            map.insert(id, item.clone());
        }

        item
    }

    /// Retrieve a pin item by ID
    pub fn get_pin(&self, id: &str) -> Option<PinItem> {
        self.pins.lock().ok()?.get(id).cloned()
    }

    /// Update zoom scale for a pin (clamped to 0.2x ~ 5.0x)
    pub fn update_scale(&self, id: &str, delta_factor: f32) -> Option<f32> {
        let mut map = self.pins.lock().ok()?;
        if let Some(pin) = map.get_mut(id) {
            pin.scale = (pin.scale * delta_factor).clamp(0.2, 5.0);
            Some(pin.scale)
        } else {
            None
        }
    }

    /// Update opacity for a pin (clamped to 0.1 ~ 1.0)
    pub fn update_opacity(&self, id: &str, opacity: f32) -> Option<f32> {
        let mut map = self.pins.lock().ok()?;
        if let Some(pin) = map.get_mut(id) {
            pin.opacity = opacity.clamp(0.1, 1.0);
            Some(pin.opacity)
        } else {
            None
        }
    }

    /// Remove/Cancel a pin
    pub fn remove_pin(&self, id: &str) -> bool {
        if let Ok(mut map) = self.pins.lock() {
            map.remove(id).is_some()
        } else {
            false
        }
    }

    /// List all active pins
    pub fn list_pins(&self) -> Vec<PinItem> {
        if let Ok(map) = self.pins.lock() {
            map.values().cloned().collect()
        } else {
            Vec::new()
        }
    }

    /// Close and clear all active pins
    pub fn clear_all(&self) {
        if let Ok(mut map) = self.pins.lock() {
            map.clear();
        }
    }
}
