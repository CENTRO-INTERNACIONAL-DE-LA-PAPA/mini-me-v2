use std::sync::{Mutex, MutexGuard};

/// Locks `mutex`, taking the value even if a thread panicked while holding it.
pub fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

/// Receives a [`Watched`] value; returns `false` once gone, which unsubscribes it.
pub type Sink<T> = Box<dyn Fn(&T) -> bool + Send>;

/// A value whose subscribers get it on subscribing and on every change, in change order.
pub struct Watched<T> {
    value: Mutex<T>,
    subscribers: Mutex<Vec<Sink<T>>>,
}

impl<T: Clone + PartialEq> Watched<T> {
    pub fn new(value: T) -> Self {
        Self {
            value: Mutex::new(value),
            subscribers: Mutex::new(Vec::new()),
        }
    }

    pub fn get(&self) -> T {
        locked(&self.value).clone()
    }

    pub fn subscribe(&self, sink: Sink<T>) {
        let value = locked(&self.value);
        if sink(&*value) {
            locked(&self.subscribers).push(sink);
        }
    }

    /// Notifies only when `value` differs from the current one.
    pub fn set(&self, value: T) {
        let mut current = locked(&self.value);
        if *current == value {
            return;
        }
        *current = value;
        locked(&self.subscribers).retain(|sink| sink(&*current));
    }

    /// Notifies even when `value` equals the current one.
    pub fn send(&self, value: T) {
        let mut current = locked(&self.value);
        *current = value;
        locked(&self.subscribers).retain(|sink| sink(&*current));
    }
}
