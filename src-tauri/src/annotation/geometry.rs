use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f32,
    pub y: f32,
}

impl Point2D {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn distance_to(&self, other: &Point2D) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArrowAnnotation {
    pub start: Point2D,
    pub end: Point2D,
    pub color: String,
    pub stroke_width: f32,
}

impl ArrowAnnotation {
    /// Calculate the two arrowhead wing points based on length and angle
    pub fn calculate_arrow_head(&self, head_length: f32, head_angle_rad: f32) -> (Point2D, Point2D) {
        let dx = self.end.x - self.start.x;
        let dy = self.end.y - self.start.y;
        let angle = dy.atan2(dx);

        let left_angle = angle - head_angle_rad;
        let right_angle = angle + head_angle_rad;

        let left_wing = Point2D::new(
            self.end.x - head_length * left_angle.cos(),
            self.end.y - head_length * left_angle.sin(),
        );

        let right_wing = Point2D::new(
            self.end.x - head_length * right_angle.cos(),
            self.end.y - head_length * right_angle.sin(),
        );

        (left_wing, right_wing)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrokeAnnotation {
    pub points: Vec<Point2D>,
    pub color: String,
    pub stroke_width: f32,
}

impl StrokeAnnotation {
    /// Check if an eraser point within radius collides with any stroke segment
    pub fn hit_test(&self, eraser_pt: &Point2D, radius: f32) -> bool {
        for pt in &self.points {
            if pt.distance_to(eraser_pt) <= radius + self.stroke_width / 2.0 {
                return true;
            }
        }
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectAnnotation {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub color: String,
    pub stroke_width: f32,
}

impl RectAnnotation {
    pub fn hit_test(&self, eraser_pt: &Point2D, radius: f32) -> bool {
        let min_x = self.x - radius;
        let max_x = self.x + self.width + radius;
        let min_y = self.y - radius;
        let max_y = self.y + self.height + radius;

        eraser_pt.x >= min_x && eraser_pt.x <= max_x && eraser_pt.y >= min_y && eraser_pt.y <= max_y
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AnnotationItem {
    #[serde(rename = "stroke")]
    Stroke(StrokeAnnotation),
    #[serde(rename = "arrow")]
    Arrow(ArrowAnnotation),
    #[serde(rename = "rect")]
    Rect(RectAnnotation),
}

/// History stack for Undo and Redo operations
#[derive(Default)]
pub struct AnnotationHistory {
    items: Vec<AnnotationItem>,
    redo_stack: Vec<AnnotationItem>,
}

impl AnnotationHistory {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, item: AnnotationItem) {
        self.items.push(item);
        self.redo_stack.clear();
    }

    pub fn undo(&mut self) -> Option<AnnotationItem> {
        if let Some(item) = self.items.pop() {
            self.redo_stack.push(item.clone());
            Some(item)
        } else {
            None
        }
    }

    pub fn redo(&mut self) -> Option<AnnotationItem> {
        if let Some(item) = self.redo_stack.pop() {
            self.items.push(item.clone());
            Some(item)
        } else {
            None
        }
    }

    /// Erase any annotations that collide with the eraser position
    pub fn erase_at(&mut self, pt: &Point2D, radius: f32) -> usize {
        let initial_count = self.items.len();
        self.items.retain(|item| match item {
            AnnotationItem::Stroke(s) => !s.hit_test(pt, radius),
            AnnotationItem::Rect(r) => !r.hit_test(pt, radius),
            AnnotationItem::Arrow(a) => {
                a.start.distance_to(pt) > radius && a.end.distance_to(pt) > radius
            }
        });
        initial_count - self.items.len()
    }

    pub fn items(&self) -> &[AnnotationItem] {
        &self.items
    }

    pub fn clear(&mut self) {
        self.items.clear();
        self.redo_stack.clear();
    }
}
