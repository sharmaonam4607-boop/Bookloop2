from app.models.notification import Notification


def create_notification(db, user_id, notification_type, title, body, **context):
    notification = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        **context,
    )
    db.add(notification)
    return notification