import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.Properties;

public class ExecuteJdbcQuery {
    public static void main(String[] args) throws Exception {
        String driverClassName = args[0];
        String jdbcUrl = args[1];
        String username = args[2];
        String password = args[3];
        String database = args[4];
        String schema = args[5];
        String sql = args[6];

        if (!driverClassName.isEmpty()) {
            Class.forName(driverClassName);
        }

        Properties properties = new Properties();
        if (!username.isEmpty()) {
            properties.setProperty("user", username);
        }
        if (!password.isEmpty()) {
            properties.setProperty("password", password);
        }

        try (Connection connection = DriverManager.getConnection(jdbcUrl, properties)) {
            if (!database.isEmpty()) {
                try {
                    connection.setCatalog(database);
                } catch (Exception ignored) {
                }
            }
            if (!schema.isEmpty()) {
                try {
                    connection.setSchema(schema);
                } catch (Exception ignored) {
                }
            }

            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                boolean hasResultSet = statement.execute();
                if (!hasResultSet) {
                    System.out.println("{\"columns\":[],\"rows\":[],\"message\":\"执行成功，影响行数：" + statement.getUpdateCount() + "\"}");
                    return;
                }

                try (ResultSet resultSet = statement.getResultSet()) {
                    ResultSetMetaData metaData = resultSet.getMetaData();
                    int columnCount = metaData.getColumnCount();
                    StringBuilder json = new StringBuilder();
                    json.append("{\"columns\":[");
                    for (int i = 1; i <= columnCount; i++) {
                        if (i > 1) {
                            json.append(',');
                        }
                        json.append('"').append(escape(metaData.getColumnLabel(i))).append('"');
                    }
                    json.append("],\"rows\":[");

                    boolean firstRow = true;
                    while (resultSet.next()) {
                        if (!firstRow) {
                            json.append(',');
                        }
                        firstRow = false;
                        json.append('[');
                        for (int i = 1; i <= columnCount; i++) {
                            if (i > 1) {
                                json.append(',');
                            }
                            Object value = resultSet.getObject(i);
                            if (value == null) {
                                json.append("null");
                            } else {
                                json.append('"').append(escape(String.valueOf(value))).append('"');
                            }
                        }
                        json.append(']');
                    }
                    json.append("],\"message\":\"查询成功\"}");
                    System.out.println(json);
                }
            }
        }
    }

    private static String escape(String value) {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\r", "\\r")
            .replace("\n", "\\n")
            .replace("\t", "\\t");
    }
}
