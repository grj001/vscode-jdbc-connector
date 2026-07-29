/**
 * 数据库连接设置
 * @param id 连接ID
 * @param name 连接名称
 * @param jdbcUrl JDBC URL
 * @param driverType 驱动类型
 * @param driverPath 驱动路径
 * @param host 主机
 * @param port 端口
 * @param database 数据库
 * @param schema 模式
 * @param username 用户名
 * @param password 密码
 * @param jdkPath JDK路径
 */
export interface ConnectionSettingsPayload {
    /**
     * 连接ID
     */
    id:string;
    /**
     * 连接名称
     */
    name: string;
    /**
     * JDBC URL
     */
    jdbcUrl: string;
    /**
     * 驱动类名
     */
    driverClass: string;
    /**
     * 驱动类型
     */
    driverType: string;
    /**
     * 驱动路径
     */
    driverPath: string;
    /**
     * 主机
     */
    host: string;
    /**
     * 端口
     */
    port: string;
    /**
     * 数据库
     */
    database: string;
    /**
     * 模式
     */
    schema: string;
    /**
     * 用户名
     */
    username: string;
    /**
     * 密码
     */
    password: string;
    /**
     * JDK路径
     */
    jdkPath?: string;
}